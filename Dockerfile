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
FROM centos:7
MAINTAINER Komal Thareja<kthare10@renci.org>
ENV container docker
RUN (cd /lib/systemd/system/sysinit.target.wants/; for i in *; do [ $i == \
systemd-tmpfiles-setup.service ] || rm -f $i; done); \
rm -f /lib/systemd/system/multi-user.target.wants/*;\
rm -f /etc/systemd/system/*.wants/*;\
rm -f /lib/systemd/system/local-fs.target.wants/*; \
rm -f /lib/systemd/system/sockets.target.wants/*udev*; \
rm -f /lib/systemd/system/sockets.target.wants/*initctl*; \
rm -f /lib/systemd/system/basic.target.wants/*;\
rm -f /lib/systemd/system/anaconda.target.wants/*;
VOLUME [ "/sys/fs/cgroup" ]

RUN mkdir -p /usr/src/app
COPY . /usr/src/app
WORKDIR /usr/src/app

RUN yum install -y epel-release gcc httpd mod_ssl mod_wsgi httpd-devel python3-devel;\
yum install -y postgresql postgresql-devel;\
pip3 install --no-cache-dir -r requirements.txt;\
groupadd credmgr;\
useradd credmgr -g credmgr;\
mkdir -p "/var/www/documents";\
mkdir -p "/var/www/cgi-bin/wsgi/credmgr";\
mkdir -p "/var/lib/credmgr";\
chown -R credmgr:credmgr "/var/lib/credmgr";\
mkdir -p "/var/log/credmgr";\
chown -R credmgr:credmgr "/var/log/credmgr";\
pip3 install .;\
mod_wsgi-express install-module > /etc/httpd/conf.modules.d/02-wsgi.conf;\
sed -i "s/REPLACE_WITH_FQDN/credmgr/g" /etc/httpd/conf.d/credmgr.conf;\
sed -i 's/w+t/wb+/g' /usr/local/lib/python3*/site-packages/daemon/runner.py;\
systemctl enable httpd;\
systemctl enable credmgrd;\
systemctl enable credmgr.swagger_server;\
echo "Setup credmgr daemon and credmgr swagger_server complete";

EXPOSE 8080 443

#CMD ["./docker-entrypoint.sh"]
CMD ["/usr/sbin/init"]
