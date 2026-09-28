package gvas

import (
	"encoding/binary"
	"fmt"
	"math"
	"unicode/utf16"
)

type shortRead struct {
	at, need, have int
}

func (e shortRead) Error() string {
	return fmt.Sprintf("the data ends at byte %d, %d bytes short of a %d-byte read", e.have, e.at+e.need-e.have, e.need)
}

type reader struct {
	data []byte
	pos  int
}

func (r *reader) take(n int) []byte {
	if n < 0 || r.pos+n > len(r.data) {
		panic(shortRead{at: r.pos, need: n, have: len(r.data)})
	}
	b := r.data[r.pos : r.pos+n]
	r.pos += n
	return b
}

func (r *reader) skip(n int) {
	r.take(n)
}

func (r *reader) u8() byte {
	return r.take(1)[0]
}

func (r *reader) u16() uint16 {
	return binary.LittleEndian.Uint16(r.take(2))
}

func (r *reader) u32() uint32 {
	return binary.LittleEndian.Uint32(r.take(4))
}

func (r *reader) i32() int32 {
	return int32(r.u32())
}

func (r *reader) u64() uint64 {
	return binary.LittleEndian.Uint64(r.take(8))
}

func (r *reader) i64() int64 {
	return int64(r.u64())
}

func (r *reader) f32() float32 {
	return math.Float32frombits(r.u32())
}

func (r *reader) f64() float64 {
	return math.Float64frombits(r.u64())
}

func (r *reader) guid() GUID {
	return GUID(fmt.Sprintf("%08X%08X%08X%08X", r.u32(), r.u32(), r.u32(), r.u32()))
}

func (r *reader) fstring() string {
	n := int(r.i32())
	switch {
	case n == 0:
		return ""
	case n > 0:
		b := r.take(n)
		return string(b[:n-1])
	default:
		units := -n
		b := r.take(units * 2)
		decoded := make([]uint16, units-1)
		for i := range decoded {
			decoded[i] = binary.LittleEndian.Uint16(b[i*2:])
		}
		return string(utf16.Decode(decoded))
	}
}

func (r *reader) printableString(at int) (string, int, bool) {
	if at+4 > len(r.data) {
		return "", 0, false
	}
	n := int(int32(binary.LittleEndian.Uint32(r.data[at:])))
	if n < 2 || n > 256 || at+4+n > len(r.data) || r.data[at+4+n-1] != 0 {
		return "", 0, false
	}
	text := r.data[at+4 : at+4+n-1]
	for _, c := range text {
		if c < 0x20 || c > 0x7e {
			return "", 0, false
		}
	}
	return string(text), 4 + n, true
}

func (r *reader) startsProperties() bool {
	name, size, ok := r.printableString(r.pos)
	if !ok {
		return false
	}
	if name == "None" {
		return true
	}
	kind, _, ok := r.printableString(r.pos + size)
	return ok && len(kind) > len("Property") && kind[len(kind)-len("Property"):] == "Property"
}
