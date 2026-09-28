package savefile

import (
	"encoding/binary"
	"errors"
	"fmt"
)

var ErrNoDecoder = errors.New("this build of the save reader has no Oodle decoder")

type Decoder func(compressed []byte, rawSize int) ([]byte, error)

type Header struct {
	RawSize        int
	CompressedSize int
	Magic          string
}

func ReadHeader(data []byte) (Header, error) {
	if len(data) < 12 {
		return Header{}, fmt.Errorf("a save needs at least 12 bytes, this one has %d", len(data))
	}
	h := Header{
		RawSize:        int(binary.LittleEndian.Uint32(data[0:4])),
		CompressedSize: int(binary.LittleEndian.Uint32(data[4:8])),
		Magic:          string(data[8:12]),
	}
	if h.Magic != "PlM1" {
		return h, fmt.Errorf("unknown save format %q", h.Magic)
	}
	if 12+h.CompressedSize != len(data) {
		return h, fmt.Errorf("the save holds %d of %d compressed bytes; it may still be being written", len(data)-12, h.CompressedSize)
	}
	return h, nil
}

func Decode(data []byte, decoder Decoder) ([]byte, error) {
	if len(data) >= 4 && string(data[:4]) == "GVAS" {
		return data, nil
	}
	h, err := ReadHeader(data)
	if err != nil {
		return nil, err
	}
	if decoder == nil {
		return nil, ErrNoDecoder
	}
	raw, err := decoder(data[12:], h.RawSize)
	if err != nil {
		return nil, fmt.Errorf("decompressing: %w", err)
	}
	if len(raw) != h.RawSize {
		return nil, fmt.Errorf("decompressed %d bytes, the header says %d", len(raw), h.RawSize)
	}
	return raw, nil
}
