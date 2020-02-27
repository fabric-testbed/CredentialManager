FROM centos:7
ENV container docker

RUN yum -y epel-release httpd mod_ssl mod_wsgi httpd-devel python3-devel
RUN systemctl enable httpd

RUN mkdir -p /usr/src/app
RUN mkdir -p /var/www/cgi-bin/credmgr/
WORKDIR /usr/src/app

COPY requirements.txt /usr/src/app/

RUN pip3 install --no-cache-dir -r requirements.txt

COPY . /usr/src/app

COPY examples/config/apache/credmgr.conf /etc/httpd/config.d/
COPY examples/wsgi/credmgr.wsgi /var/www/cgi-bin/credmgr/


CMD ["/usr/sbin/init"]
