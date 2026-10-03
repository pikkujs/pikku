#!/bin/sh
set -eu
platform=${1:-linux/arm64}
version=${GIT_VERSION:-2.51.0}
root=$(cd "$(dirname "$0")/.." && pwd)
out="$root/.deploy/git/$(echo "$platform" | tr / -)"
rm -rf "$out" && mkdir -p "$out"
docker run --rm --platform "$platform" -v "$out:/out" alpine:3.22 sh -euc "
apk add --no-cache build-base curl-dev curl-static openssl-libs-static zlib-static nghttp2-static brotli-static zstd-static libpsl-static libidn2-static libunistring-static pkgconf ca-certificates >/dev/null
wget -qO- https://mirrors.edge.kernel.org/pub/software/scm/git/git-$version.tar.gz | tar xz -C /tmp
cd /tmp/git-$version
make -j\$(nproc) prefix=/git RUNTIME_PREFIX=YesPlease NO_GETTEXT=YesPlease NO_TCLTK=YesPlease NO_PERL=YesPlease NO_PYTHON=YesPlease NO_EXPAT=YesPlease NO_REGEX=YesPlease INSTALL_SYMLINKS=YesPlease \
  CFLAGS='-O2' LDFLAGS='-static -Wl,--allow-multiple-definition' CURL_LDFLAGS=\"\$(pkg-config --static --libs libcurl)\" install >/dev/null
mkdir -p /out/bin /out/libexec/git-core /out/share/git-core /out/etc
cp /git/bin/git /out/bin/git
cp /git/libexec/git-core/git-remote-http /out/libexec/git-core/git-remote-http
cp -r /git/share/git-core/templates /out/share/git-core/templates
cp /etc/ssl/certs/ca-certificates.crt /out/etc/ca-certificates.crt
strip /out/bin/git /out/libexec/git-core/git-remote-http
chown -R $(id -u):$(id -g) /out
"
du -sh "$out"/bin/git "$out"/libexec/git-core/git-remote-http
