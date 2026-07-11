FROM alpine:3.21

RUN apk add --no-cache bash curl coreutils

WORKDIR /opt/life-os

COPY docker/ops/monitor.sh /opt/life-os/monitor.sh

RUN chmod +x /opt/life-os/monitor.sh

ENTRYPOINT ["/opt/life-os/monitor.sh"]
