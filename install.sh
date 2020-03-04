#!/usr/bin/env bash
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

# Install the required packages
yum install -y epel-release gcc httpd mod_ssl mod_wsgi httpd-devel python3-devel
pip3 install --no-cache-dir -r requirements.txt

# Create credmgr user
groupadd credmgr
useradd credmgr -g credmgr

mkdir -p "/var/www/documents"
mkdir -p "/var/www/cgi-bin/wsgi/credmgr"
mkdir -p "/var/lib/credmgr"
chown -R credmgr:credmgr "/var/lib/credmgr"
mkdir -p "/var/log/credmgr"
chown -R credmgr:credmgr "/var/log/credmgr"

# Install Credmgr
pip3 install .

# Generate mod_wsgi config
mod_wsgi-express install-module > /etc/httpd/conf.modules.d/02-wsgi.conf
systemctl enable httpd

# Setup MOD_WSGI for CredMgr
echo "Httpd setup started"
FQDN=`hostname -f`
echo "Updating the FQDN to $FQDN"

sed -i "s/REPLACE_WITH_FQDN/$FQDN/g" /etc/httpd/conf.d/credmgr.conf
sed -i "s/REPLACE_WITH_FQDN/$FQDN/g" req.cnf
sed -i 's/w+t/wb+/g' /usr/local/lib/python3*/site-packages/daemon/runner.py

echo "Generating certificates"
./generate-certificates.sh
cp certs/self.signed.crt /etc/credmgr/hostcert.pem
cp certs/self.signed.key /etc/credmgr/hostkey.pem
#cp certs/ca.crt /etc/credmgr/ca.crt

echo "Httpd setup complete! Restarting httpd!"
systemctl restart httpd

echo "Setup credmgr daemon and credmgr swagger_server"
systemctl enable credmgrd
service credmgrd start &

systemctl enable credmgr.swagger_server
service credmgr.swagger_server start &

echo "Please update OAUTH parameters in /etc/credmgr/config and restart httpd by running the command 'systemctl restart httpd'"