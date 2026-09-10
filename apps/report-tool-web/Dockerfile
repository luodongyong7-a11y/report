FROM nginx:1.28-alpine
COPY apps/report-tool-web/dist /usr/share/nginx/html
COPY apps/report-tool-web/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
