FROM --platform=$BUILDPLATFORM golang:1.27.1-alpine3.24 AS build
RUN apk add --no-cache ca-certificates
WORKDIR /src/collector
COPY collector/go.mod collector/go.sum ./
RUN go mod download
COPY package.json /src/package.json
COPY collector/ ./
ARG VERSION
ARG TARGETOS
ARG TARGETARCH
RUN version="${VERSION:-$(sed -n 's/^  "version": "\(.*\)",$/\1/p' /src/package.json)}" \
 && CGO_ENABLED=0 GOOS="$TARGETOS" GOARCH="$TARGETARCH" go build -trimpath -ldflags "-s -w -X github.com/oddessentials/skylark/collector/internal/buildinfo.Version=${version}" -o /out/skylark-collector ./cmd/skylark-collector \
 && mkdir -p /out/data

FROM scratch
COPY --from=build /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt
COPY --from=build /out/skylark-collector /skylark-collector
COPY --from=build /out/data /data
ENV SKYLARK_JOURNAL_DIR=/data \
    SKYLARK_LOGS_SOURCE=docker
VOLUME ["/data"]
ENTRYPOINT ["/skylark-collector"]
