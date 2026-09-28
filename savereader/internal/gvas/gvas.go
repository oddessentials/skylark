package gvas

import (
	"errors"
	"fmt"
	"strings"
)

type GUID string

const ZeroGUID GUID = "00000000000000000000000000000000"

type DateTime int64

type Header struct {
	SaveVersion   int32
	UE4Version    int32
	UE5Version    int32
	EngineVersion string
	ClassName     string
}

type Property struct {
	Name  string
	Type  string
	Value any
}

type Properties []Property

type Struct struct {
	Type   string
	Fields Properties
}

type MapEntry struct {
	Key   any
	Value any
}

type Skipped struct {
	Type string
	Size int
}

type Document struct {
	Header     Header
	Properties Properties
}

type StructKind int

const (
	GuessStruct StructKind = iota
	GUIDStruct
	PropertyStruct
)

type Options struct {
	Skip   func(path string) bool
	Struct func(path string) StructKind
}

type parser struct {
	options Options
}

func Parse(data []byte, options Options) (doc *Document, err error) {
	defer recoverInto(&err)
	r := &reader{data: data}
	if len(data) < 4 || string(r.take(4)) != "GVAS" {
		return nil, errors.New("not a GVAS save")
	}
	doc = &Document{}
	h := &doc.Header
	h.SaveVersion = r.i32()
	h.UE4Version = r.i32()
	if h.SaveVersion >= 3 {
		h.UE5Version = r.i32()
	}
	major, minor, patch := r.u16(), r.u16(), r.u16()
	changelist := r.u32()
	branch := r.fstring()
	h.EngineVersion = fmt.Sprintf("%d.%d.%d-%d+%s", major, minor, patch, changelist, branch)
	r.i32()
	customs := int(r.i32())
	for range customs {
		r.skip(20)
	}
	h.ClassName = r.fstring()
	p := &parser{options: options}
	doc.Properties = p.properties(r, "")
	return doc, nil
}

func ParseProperties(data []byte, options Options) (props Properties, consumed int, err error) {
	defer recoverInto(&err)
	r := &reader{data: data}
	p := &parser{options: options}
	props = p.properties(r, "")
	return props, r.pos, nil
}

func recoverInto(err *error) {
	recovered := recover()
	if recovered == nil {
		return
	}
	if e, ok := recovered.(error); ok {
		*err = e
		return
	}
	*err = fmt.Errorf("%v", recovered)
}

func join(path, name string) string {
	if path == "" {
		return name
	}
	return path + "." + name
}

func (p *parser) skipping(path string) bool {
	return p.options.Skip != nil && p.options.Skip(path)
}

func (p *parser) properties(r *reader, path string) Properties {
	var props Properties
	for {
		name := r.fstring()
		if name == "None" || name == "" {
			return props
		}
		kind := r.fstring()
		size := int(r.i32())
		r.i32()
		child := join(path, name)
		value := p.tagged(r, child, kind, size)
		props = append(props, Property{Name: name, Type: kind, Value: value})
	}
}

func (p *parser) optionalGUID(r *reader) {
	if r.u8() != 0 {
		r.skip(16)
	}
}

func (p *parser) sized(r *reader, path, kind string, size int, read func() any) any {
	if p.skipping(path) {
		r.skip(size)
		return Skipped{Type: kind, Size: size}
	}
	start := r.pos
	value := read()
	if r.pos-start != size {
		panic(fmt.Errorf("%s: read %d bytes of a %d-byte %s", path, r.pos-start, size, kind))
	}
	return value
}

func (p *parser) tagged(r *reader, path, kind string, size int) any {
	switch kind {
	case "StructProperty":
		structType := r.fstring()
		r.skip(16)
		p.optionalGUID(r)
		return p.sized(r, path, kind, size, func() any { return p.structValue(r, path, structType) })
	case "BoolProperty":
		value := r.u8() != 0
		p.optionalGUID(r)
		return value
	case "ByteProperty":
		enum := r.fstring()
		p.optionalGUID(r)
		return p.sized(r, path, kind, size, func() any {
			if enum == "None" {
				return int64(r.u8())
			}
			return r.fstring()
		})
	case "EnumProperty":
		r.fstring()
		p.optionalGUID(r)
		return p.sized(r, path, kind, size, func() any { return r.fstring() })
	case "ArrayProperty":
		inner := r.fstring()
		p.optionalGUID(r)
		return p.sized(r, path, kind, size, func() any { return p.array(r, path, inner) })
	case "SetProperty":
		inner := r.fstring()
		p.optionalGUID(r)
		return p.sized(r, path, kind, size, func() any {
			removed := int(r.i32())
			for range removed {
				p.element(r, path, inner)
			}
			count := int(r.i32())
			items := make([]any, 0, count)
			for range count {
				items = append(items, p.element(r, path, inner))
			}
			return items
		})
	case "MapProperty":
		keyType := r.fstring()
		valueType := r.fstring()
		p.optionalGUID(r)
		return p.sized(r, path, kind, size, func() any {
			removed := int(r.i32())
			for range removed {
				p.element(r, path+".Key", keyType)
			}
			count := int(r.i32())
			entries := make([]MapEntry, 0, count)
			for range count {
				key := p.element(r, path+".Key", keyType)
				value := p.element(r, path+".Value", valueType)
				entries = append(entries, MapEntry{Key: key, Value: value})
			}
			return entries
		})
	default:
		p.optionalGUID(r)
		return p.sized(r, path, kind, size, func() any { return p.scalar(r, kind, size) })
	}
}

func (p *parser) scalar(r *reader, kind string, size int) any {
	switch kind {
	case "IntProperty":
		return int64(r.i32())
	case "Int64Property":
		return r.i64()
	case "Int16Property":
		return int64(int16(r.u16()))
	case "Int8Property":
		return int64(int8(r.u8()))
	case "UInt16Property":
		return int64(r.u16())
	case "UInt32Property":
		return int64(r.u32())
	case "UInt64Property":
		return r.u64()
	case "FloatProperty":
		return float64(r.f32())
	case "DoubleProperty":
		return r.f64()
	case "StrProperty", "NameProperty", "ObjectProperty":
		return r.fstring()
	case "SoftObjectProperty":
		asset := r.fstring()
		sub := r.fstring()
		if sub == "" {
			return asset
		}
		return asset + ":" + sub
	default:
		r.skip(size)
		return Skipped{Type: kind, Size: size}
	}
}

func (p *parser) element(r *reader, path, kind string) any {
	switch kind {
	case "StructProperty":
		switch p.structKind(path) {
		case GUIDStruct:
			return r.guid()
		case PropertyStruct:
			return p.properties(r, path)
		default:
			if r.startsProperties() {
				return p.properties(r, path)
			}
			return r.guid()
		}
	case "BoolProperty":
		return r.u8() != 0
	case "ByteProperty":
		return int64(r.u8())
	case "EnumProperty", "NameProperty", "StrProperty", "ObjectProperty":
		return r.fstring()
	case "IntProperty":
		return int64(r.i32())
	case "Int64Property":
		return r.i64()
	case "UInt32Property":
		return int64(r.u32())
	case "UInt64Property":
		return r.u64()
	case "FloatProperty":
		return float64(r.f32())
	case "DoubleProperty":
		return r.f64()
	}
	panic(fmt.Errorf("%s: cannot read a %s element", path, kind))
}

func (p *parser) structKind(path string) StructKind {
	if p.options.Struct == nil {
		return GuessStruct
	}
	return p.options.Struct(path)
}

func (p *parser) array(r *reader, path, inner string) any {
	count := int(r.i32())
	switch inner {
	case "ByteProperty":
		return append([]byte(nil), r.take(count)...)
	case "StructProperty":
		r.fstring()
		r.fstring()
		r.skip(8)
		structType := r.fstring()
		r.skip(16)
		p.optionalGUID(r)
		items := make([]any, 0, count)
		for range count {
			items = append(items, p.structValue(r, path, structType))
		}
		return items
	default:
		items := make([]any, 0, count)
		for range count {
			items = append(items, p.element(r, path, inner))
		}
		return items
	}
}

func (p *parser) structValue(r *reader, path, structType string) any {
	switch structType {
	case "Vector", "Rotator":
		return [3]float64{r.f64(), r.f64(), r.f64()}
	case "Quat":
		return [4]float64{r.f64(), r.f64(), r.f64(), r.f64()}
	case "Vector2D":
		return [2]float64{r.f64(), r.f64()}
	case "LinearColor":
		return [4]float64{float64(r.f32()), float64(r.f32()), float64(r.f32()), float64(r.f32())}
	case "Color":
		return int64(r.u32())
	case "Guid":
		return r.guid()
	case "DateTime", "Timespan":
		return DateTime(r.i64())
	case "IntPoint":
		return [2]int64{int64(r.i32()), int64(r.i32())}
	}
	return Struct{Type: structType, Fields: p.properties(r, path)}
}

func (props Properties) Get(name string) (any, bool) {
	for _, prop := range props {
		if prop.Name == name {
			return prop.Value, true
		}
	}
	return nil, false
}

func (props Properties) Fields(name string) Properties {
	value, _ := props.Get(name)
	switch v := value.(type) {
	case Struct:
		return v.Fields
	case Properties:
		return v
	}
	return nil
}

func (props Properties) Path(names ...string) Properties {
	current := props
	for _, name := range names {
		current = current.Fields(name)
	}
	return current
}

func (props Properties) Int(name string) (int64, bool) {
	value, _ := props.Get(name)
	switch v := value.(type) {
	case int64:
		return v, true
	case uint64:
		return int64(v), true
	}
	return 0, false
}

func (props Properties) String(name string) (string, bool) {
	value, _ := props.Get(name)
	s, ok := value.(string)
	return s, ok
}

func (props Properties) Bool(name string) bool {
	value, _ := props.Get(name)
	b, _ := value.(bool)
	return b
}

func (props Properties) GUID(name string) (GUID, bool) {
	value, _ := props.Get(name)
	switch v := value.(type) {
	case GUID:
		return v, true
	case Struct:
		return v.Fields.GUID("ID")
	case Properties:
		return v.GUID("ID")
	}
	return "", false
}

func (props Properties) Bytes(name string) []byte {
	value, _ := props.Get(name)
	b, _ := value.([]byte)
	return b
}

func (props Properties) Map(name string) []MapEntry {
	value, _ := props.Get(name)
	entries, _ := value.([]MapEntry)
	return entries
}

func (props Properties) Array(name string) []any {
	value, _ := props.Get(name)
	items, _ := value.([]any)
	return items
}

func (props Properties) DateTime(name string) (DateTime, bool) {
	value, _ := props.Get(name)
	t, ok := value.(DateTime)
	return t, ok
}

func EnumValue(value string) string {
	if at := strings.LastIndex(value, "::"); at >= 0 {
		return value[at+2:]
	}
	return value
}
