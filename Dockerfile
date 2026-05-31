# MIT License
#
# Copyright (c) 2020 FABRIC Testbed
#
# Permission is hereby granted, free of charge, to any person obtaining a copy
# of this software and associated documentation files (the "Software"), to deal
# in the Software without restriction, including without limitation the rights
# to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
# copies of the Software, and to permit persons to whom the Software is
# furnished to do so, subject to the following conditions:
#
# The above copyright notice and this permission notice shall be included in all
# copies or substantial portions of the Software.
#
# THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
# IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
# FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
# AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
# LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
# OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
# SOFTWARE.
#
# Author Komal Thareja (kthare10@renci.org)
FROM python:3.13
MAINTAINER Komal Thareja<komal.thareja@gmail.com>

RUN mkdir -p /usr/src/app
RUN mkdir -p /etc/credmgr/
RUN touch /etc/credmgr/private.pem
RUN touch /etc/credmgr/public.pem

WORKDIR /usr/src/app

COPY . /usr/src/app/

RUN pip3 install .

# Install gosu for dropping privileges after fixing bind-mount permissions
RUN apt-get update && apt-get install -y --no-install-recommends gosu && rm -rf /var/lib/apt/lists/*

# Create non-root user for security
RUN mkdir -p /var/log/credmgr \
    && groupadd -r credmgr && useradd -r -g credmgr -d /usr/src/app credmgr \
    && chown -R credmgr:credmgr /usr/src/app /etc/credmgr /var/log/credmgr

COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 7000 8100

# Start as root so entrypoint can fix bind-mount ownership, then drop to credmgr via gosu
ENTRYPOINT ["docker-entrypoint.sh"]

CMD ["-m", "fabric_cm.credmgr.swagger_server"]