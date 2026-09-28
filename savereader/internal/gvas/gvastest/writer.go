package gvastest

import (
	"bytes"
	"encoding/binary"
	"encoding/hex"
	"math"
	"strings"
	"unicode/utf16"
)

type Buffer struct {
	bytes.Buffer
}

func (b *Buffer) U8(v byte) *Buffer {
	b.WriteByte(v)
	return b
}

func (b *Buffer) U16(v uint16) *Buffer {
	binary.Write(&b.Buffer, binary.LittleEndian, v)
	return b
}

func (b *Buffer) U32(v uint32) *Buffer {
	binary.Write(&b.Buffer, binary.LittleEndian, v)
	return b
}

func (b *Buffer) I32(v int32) *Buffer {
	binary.Write(&b.Buffer, binary.LittleEndian, v)
	return b
}

func (b *Buffer) I64(v int64) *Buffer {
	binary.Write(&b.Buffer, binary.LittleEndian, v)
	return b
}

func (b *Buffer) F32(v float32) *Buffer {
	return b.U32(math.Float32bits(v))
}

func (b *Buffer) F64(v float64) *Buffer {
	binary.Write(&b.Buffer, binary.LittleEndian, math.Float64bits(v))
	return b
}

func (b *Buffer) GUID(text string) *Buffer {
	padded := text + strings.Repeat("0", 32-len(text))
	for i := range 4 {
		raw, err := hex.DecodeString(padded[i*8 : i*8+8])
		if err != nil {
			panic(err)
		}
		b.U32(binary.BigEndian.Uint32(raw))
	}
	return b
}

func (b *Buffer) String(s string) *Buffer {
	if s == "" {
		return b.I32(0)
	}
	ascii := true
	for _, r := range s {
		if r > 0x7e {
			ascii = false
		}
	}
	if ascii {
		b.I32(int32(len(s) + 1))
		b.WriteString(s)
		return b.U8(0)
	}
	units := utf16.Encode([]rune(s))
	b.I32(-int32(len(units) + 1))
	for _, unit := range units {
		b.U16(unit)
	}
	return b.U16(0)
}

func (b *Buffer) Bytes() []byte {
	return b.Buffer.Bytes()
}

type Prop func(b *Buffer)

func tag(name, kind string, typeData func(b *Buffer), value func(b *Buffer)) Prop {
	return func(b *Buffer) {
		var body Buffer
		value(&body)
		b.String(name).String(kind).I32(int32(body.Len())).I32(0)
		typeData(b)
		b.Write(body.Bytes())
	}
}

func noGUID(b *Buffer) {
	b.U8(0)
}

func Int(name string, v int32) Prop {
	return tag(name, "IntProperty", noGUID, func(b *Buffer) { b.I32(v) })
}

func Int64(name string, v int64) Prop {
	return tag(name, "Int64Property", noGUID, func(b *Buffer) { b.I64(v) })
}

func Float(name string, v float32) Prop {
	return tag(name, "FloatProperty", noGUID, func(b *Buffer) { b.F32(v) })
}

func Str(name, v string) Prop {
	return tag(name, "StrProperty", noGUID, func(b *Buffer) { b.String(v) })
}

func Name(name, v string) Prop {
	return tag(name, "NameProperty", noGUID, func(b *Buffer) { b.String(v) })
}

func Bool(name string, v bool) Prop {
	return func(b *Buffer) {
		b.String(name).String("BoolProperty").I32(0).I32(0)
		if v {
			b.U8(1)
		} else {
			b.U8(0)
		}
		b.U8(0)
	}
}

func Byte(name string, v byte) Prop {
	return tag(name, "ByteProperty", func(b *Buffer) { b.String("None").U8(0) }, func(b *Buffer) { b.U8(v) })
}

func Enum(name, enumType, v string) Prop {
	return tag(name, "EnumProperty", func(b *Buffer) { b.String(enumType).U8(0) }, func(b *Buffer) { b.String(v) })
}

func structTag(name, structType string, value func(b *Buffer)) Prop {
	return tag(name, "StructProperty", func(b *Buffer) {
		b.String(structType).GUID("").U8(0)
	}, value)
}

func Struct(name, structType string, fields ...Prop) Prop {
	return structTag(name, structType, func(b *Buffer) { writeFields(b, fields) })
}

func GUID(name, v string) Prop {
	return structTag(name, "Guid", func(b *Buffer) { b.GUID(v) })
}

func DateTime(name string, ticks int64) Prop {
	return structTag(name, "DateTime", func(b *Buffer) { b.I64(ticks) })
}

func Vector(name string, x, y, z float64) Prop {
	return structTag(name, "Vector", func(b *Buffer) { b.F64(x).F64(y).F64(z) })
}

func Bytes(name string, data []byte) Prop {
	return tag(name, "ArrayProperty", func(b *Buffer) { b.String("ByteProperty").U8(0) }, func(b *Buffer) {
		b.I32(int32(len(data)))
		b.Write(data)
	})
}

func Names(name string, values ...string) Prop {
	return tag(name, "ArrayProperty", func(b *Buffer) { b.String("NameProperty").U8(0) }, func(b *Buffer) {
		b.I32(int32(len(values)))
		for _, v := range values {
			b.String(v)
		}
	})
}

type Elem func(b *Buffer)

func NameElem(v string) Elem {
	return func(b *Buffer) { b.String(v) }
}

func BoolElem(v bool) Elem {
	return func(b *Buffer) {
		if v {
			b.U8(1)
		} else {
			b.U8(0)
		}
	}
}

func IntElem(v int32) Elem {
	return func(b *Buffer) { b.I32(v) }
}

func GUIDElem(v string) Elem {
	return func(b *Buffer) { b.GUID(v) }
}

func FieldsElem(fields ...Prop) Elem {
	return func(b *Buffer) { writeFields(b, fields) }
}

type Entry struct {
	Key   Elem
	Value Elem
}

func Map(name, keyType, valueType string, entries ...Entry) Prop {
	return tag(name, "MapProperty", func(b *Buffer) { b.String(keyType).String(valueType).U8(0) }, func(b *Buffer) {
		b.I32(0).I32(int32(len(entries)))
		for _, entry := range entries {
			entry.Key(b)
			entry.Value(b)
		}
	})
}

func writeFields(b *Buffer, fields []Prop) {
	for _, field := range fields {
		field(b)
	}
	b.String("None")
}

func Stream(props ...Prop) []byte {
	var b Buffer
	writeFields(&b, props)
	return b.Bytes()
}

func Document(class string, props ...Prop) []byte {
	var b Buffer
	b.WriteString("GVAS")
	b.I32(3).I32(522).I32(1008)
	b.U16(5).U16(1).U16(1).U32(0).String("++UE5+Release-5.1")
	b.I32(3).I32(1).GUID("1").I32(1)
	b.String(class)
	writeFields(&b, props)
	b.I32(0)
	return b.Bytes()
}
