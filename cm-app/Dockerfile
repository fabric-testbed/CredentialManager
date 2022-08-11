FROM node:lts
MAINTAINER Komal Thareja

VOLUME /code
WORKDIR /code

COPY ./package.json ./
COPY ./src ./src
COPY ./public ./public
COPY ./docker-entrypoint.sh ./

WORKDIR /

EXPOSE 3000

ENTRYPOINT ["/code/docker-entrypoint.sh"]
CMD ["run_server"]
