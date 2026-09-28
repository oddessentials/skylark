package ooz

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"sync"

	"github.com/tetratelabs/wazero"
	"github.com/tetratelabs/wazero/api"
)

const WasmSHA256 = "be3ceea0fc7b4a9ea24715781ea55de9645964a8f2347a1b06c0c859a2eb4bcd"

const MaxRawSize = 1 << 30

const slack = 64

type Decoder struct {
	mu         sync.Mutex
	ctx        context.Context
	runtime    wazero.Runtime
	module     api.Module
	malloc     api.Function
	free       api.Function
	decompress api.Function
}

func Wasm() ([]byte, error) {
	data, err := base64.StdEncoding.DecodeString(wasmBase64)
	if err != nil {
		return nil, fmt.Errorf("the embedded Oodle decoder is unreadable: %w", err)
	}
	sum := sha256.Sum256(data)
	if hex.EncodeToString(sum[:]) != WasmSHA256 {
		return nil, errors.New("the embedded Oodle decoder does not match its checksum")
	}
	return data, nil
}

func New(ctx context.Context) (*Decoder, error) {
	wasm, err := Wasm()
	if err != nil {
		return nil, err
	}
	runtime := wazero.NewRuntime(ctx)
	_, err = runtime.NewHostModuleBuilder("a").
		NewFunctionBuilder().WithFunc(resizeHeap).Export("a").
		NewFunctionBuilder().WithFunc(copyWithin).Export("b").
		Instantiate(ctx)
	if err != nil {
		runtime.Close(ctx)
		return nil, fmt.Errorf("preparing the Oodle decoder: %w", err)
	}
	module, err := runtime.Instantiate(ctx, wasm)
	if err != nil {
		runtime.Close(ctx)
		return nil, fmt.Errorf("loading the Oodle decoder: %w", err)
	}
	d := &Decoder{
		ctx:        ctx,
		runtime:    runtime,
		module:     module,
		malloc:     module.ExportedFunction("e"),
		free:       module.ExportedFunction("f"),
		decompress: module.ExportedFunction("g"),
	}
	constructors := module.ExportedFunction("d")
	if d.malloc == nil || d.free == nil || d.decompress == nil || constructors == nil {
		runtime.Close(ctx)
		return nil, errors.New("the Oodle decoder lacks the functions it should export")
	}
	if _, err := constructors.Call(ctx); err != nil {
		runtime.Close(ctx)
		return nil, fmt.Errorf("starting the Oodle decoder: %w", err)
	}
	return d, nil
}

func resizeHeap(_ context.Context, m api.Module, requested uint32) uint32 {
	memory := m.Memory()
	size := memory.Size()
	if requested <= size {
		return 1
	}
	if _, ok := memory.Grow((requested - size + 65535) / 65536); !ok {
		return 0
	}
	return 1
}

func copyWithin(_ context.Context, m api.Module, dest, src, count uint32) {
	memory := m.Memory()
	data, ok := memory.Read(src, count)
	if !ok {
		return
	}
	memory.Write(dest, append([]byte(nil), data...))
}

func (d *Decoder) Decode(compressed []byte, rawSize int) ([]byte, error) {
	if rawSize < 0 || rawSize > MaxRawSize {
		return nil, fmt.Errorf("a save of %d bytes is larger than the reader accepts", rawSize)
	}
	if len(compressed) > MaxRawSize {
		return nil, fmt.Errorf("a compressed save of %d bytes is larger than the reader accepts", len(compressed))
	}
	d.mu.Lock()
	defer d.mu.Unlock()
	src, err := d.alloc(len(compressed) + slack)
	if err != nil {
		return nil, err
	}
	defer d.release(src)
	dst, err := d.alloc(rawSize + slack)
	if err != nil {
		return nil, err
	}
	defer d.release(dst)
	memory := d.module.Memory()
	padded := make([]byte, len(compressed)+slack)
	copy(padded, compressed)
	if !memory.Write(src, padded) {
		return nil, errors.New("the Oodle decoder has no room for the save")
	}
	results, err := d.decompress.Call(d.ctx, uint64(src), uint64(len(compressed)), uint64(dst), uint64(rawSize))
	if err != nil {
		return nil, fmt.Errorf("the Oodle decoder failed: %w", err)
	}
	if written := int32(uint32(results[0])); int(written) != rawSize {
		return nil, fmt.Errorf("the Oodle decoder produced %d of %d bytes", written, rawSize)
	}
	out, ok := memory.Read(dst, uint32(rawSize))
	if !ok {
		return nil, errors.New("the Oodle decoder wrote outside its memory")
	}
	return append([]byte(nil), out...), nil
}

func (d *Decoder) alloc(size int) (uint32, error) {
	results, err := d.malloc.Call(d.ctx, uint64(size))
	if err != nil {
		return 0, fmt.Errorf("the Oodle decoder could not allocate %d bytes: %w", size, err)
	}
	pointer := uint32(results[0])
	if pointer == 0 {
		return 0, fmt.Errorf("the Oodle decoder could not allocate %d bytes", size)
	}
	return pointer, nil
}

func (d *Decoder) release(pointer uint32) {
	d.free.Call(d.ctx, uint64(pointer))
}

func (d *Decoder) Close() error {
	return d.runtime.Close(d.ctx)
}
