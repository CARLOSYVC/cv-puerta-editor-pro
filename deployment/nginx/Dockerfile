FROM nginx:1.28-alpine

RUN apk add --no-cache gettext \
    && rm -f /etc/nginx/conf.d/default.conf
COPY nginx-start.sh /usr/local/bin/nginx-start
COPY bootstrap.conf.template tls.conf.template /etc/nginx/templates/
RUN chmod 755 /usr/local/bin/nginx-start

ENTRYPOINT ["/usr/local/bin/nginx-start"]
CMD ["nginx", "-g", "daemon off;"]
