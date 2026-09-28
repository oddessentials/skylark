package ingest

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"strconv"
)

const (
	TimestampHeader = "X-Skylark-Timestamp"
	SignatureHeader = "X-Skylark-Signature"
	signaturePrefix = "sha256="
)

func Sign(secret string, timestamp int64, body []byte) string {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(strconv.FormatInt(timestamp, 10)))
	mac.Write([]byte{'.'})
	mac.Write(body)
	return signaturePrefix + hex.EncodeToString(mac.Sum(nil))
}

func Verify(secret string, timestamp int64, body []byte, signature string) bool {
	return hmac.Equal([]byte(Sign(secret, timestamp, body)), []byte(signature))
}
