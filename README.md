# Introduction
Ibenchjs is a scalability-oriented benchmark framework, and a set of sample test applications. Ibenchjs can evaluate and measure different scalability strategies applied in Node.js.
In this version, Ibenchjs only runs on Docker Swarm. Therefore, a Docker Swarm should be setup to use this benchmark framework.
Overall, Ibenchjs follows a two-tier architectural model, which consists of a client side and a server side.
The Ibenchjs benchmark framework consists of five components: the executor, the RC, the analyzer, the register, and the image registry; they run in either the client or the server side.

- Client:
  - the executor: is responsible for launching a complete benchmark run and printing out final report
  - the analyzer: post-processes the collected raw data
- Server:
  - the RC: takes a snapshot of resource usage before and after a benchmark run
  - the register: acts as an access point, accepting concurrent requests from the client side and accordingly routing to sample/or  user-defined test applications
  - the image registry: stores images and distribute them to any node in the Docker Swarm
  
# Current Directory Structure

- /executor: contains three shell scripts, running in the client side, to launch benchmark runs on different scalability    strategies, which are
  - runRIBench_single.sh: benchmark horizontal scaling strategy in a single node
  - runRIBench_single_cluster.sh: benchmark cluster module strategy in a single node
  - runRIBench_mul.sh: benchmark horizontal scaling strategy in multiple nodes

- /analyzer: contains one JavaScript file "rcAnalyzer.js", utilized to post-process raw data; it runs in the client side
- /collector: contains two files. which are
  - rcCollector.js: a JavaScript file, used to collect resource usage data before and after benchmark run
  - host.json: a JSON file, allowing users to configure which nodes to run the benchmark service. It works like a DNS service   and the key is the node's hostname and the value is the node's IP address

- /benchmark: stores the register component and sample test applications
  - benchmarks.js: a JavaScript file working as web server to call associated test applications to handle requests from the   client side. It implements the register component.
  - Dockerfile-benchmark: it is a Dockerfile used to define the execution environment of the container
- /app: this directory stores a set of sample or user-defined test applications, called by the register component
- /templets: stores YAML files that defines how benchmarks as a service stack deployed to the Docker Swarm, which has three files
  - docker-compose_ri_single.yml: defines the benchmark service stack deployment in a single node, when benchmarking the  horizontal scaling strategy
  - docker-compose_ri_single_cluster.yml: defines the benchmark service stack deployment in a single node, when benchmarking the cluster module strategy
  - docker-compose_ri_mul.yml: defines the benchmark service stack deployment in multiple nodes, when benchmarking the horizontal scaling strategy

- /results: stores the benchmark run results

- /logs: stores the JMeter log files

- /configs: stores JMeter JTL log files

# Metrics

Ibenchjs produces the following metrics collected from JMeter and the RC component:
- JMeter JTL log file: is formatted in CSV with headers stored in the directory ~/ibenchjs/configs/. Each line represents a single request and each column of the request is separated by commas. There are sixteen columns and we only consider the columns: 1) time stamp; 2) response code (e.g. 200 indicates a successful request); and 3) latency (the time from just before sending the request to just after the first response has been received). These column data will be post-processed by the analyzer component and generate the following metrics:
  - throughput: the number of requests processed within a fixed time-frame
  - response time: it is 95 percentile of response time

- RC component: collects two-time resource usage data from each worker node and the analyzer post-processes them, generating the  following metrics:
  - resource usage: it includes CPU utilization %, incoming and outgoing network throughput, disk I/O throughput, and RSS
  
# Client Setup
In the client side, run the executor component and analyzer component in the Linux OS. 
## Prerequisites
- Download and install Node.js from https://nodejs.org/en/download/
- Download and install JMeter from https://jmeter.apache.org/download_jmeter.cgi
## Parameter Setup
Before users starting the benchmark run, users have to configure parameters in the directory ~/ibenchjs/executor/ listed below:
- REMOTE_SERVER_DIR: defines the location of benchmark service in the server side; the default value is "/home/ubuntu/nodejs/benchmarks/"
- STACK_NAME: defines the benchmark service stack name; the default value is "sbench"
- RSA_PATH: defines the public key location to access the remote server; the default value is "~/.ssh/scp_rsa"
- REMOTE_USERNAME: defines the username of the remoter server
- MANAGER_NODE_IP: defines the manager node's IP address
- SERVER_PORT: defines the port of the benchmark service stack deployed in the manager node
- jmeter_path: defines the path of the execution JMeter
- RESULT_FILE: defines the location of the final report
Afterwards, users configure parameters in the in the directory ~/ibenchjs/templets/ YAML file, specifying how benchmark service stack deploys in server cluster and resource constraints in a container.
- image: defines the image name; the default value is "xxx.xxx.xxx.xxx:xxxx/ibench"
- deploy/resources/limits/cpus: defines the number of virtual CPU cores in a container; the default value is 1
- deploy/resources/limits/memory: defines the memory size in a container; the default value is 512M
- placement/constraints: defines the constraints of which node does not run the benchmark service; configure this parameter, when you benchmark the horizontal scaling strategy in multiple nodes
- environment/CPU_COUNT: defines the number of worker processes when benchmarking the cluster module; the default value is 0; configure this parameter, when you benchmark the cluster module strategy in the single node
- environment/NODE_SERVER_PORT: defines the public port to the container; the default one is 9001
- environment/PRIME: defines the value of big integer when using the CPU-intensive test application; the default value is 10971096049
  
## Testing

Once you have installed all needed software, you can start different types of benchmark runs. Before you test the client side, you MUST setup the server side (see server setup section)!

- Case 1: benchmark the horizontal scaling strategy in a single node
  - Configure parameters (see Parameter Setup section) in the file ~/ibenchjs/exector/runRIBench_single.sh
  - Specify the test application endpoint (get_urls) and node's hostname (node_arr) running the benchmark service in the file ~/ibenchjs/exector/runRIBench_single.sh
  - Configure parameters (see Parameter Setup section) in the YAML file ~/ibenchjs/templets/docker-compose_ri_single.yml
  - execute the command
 ```
  ./exector/runRIBench_single.sh
 ```
- Case 2: benchmark the cluster module strategy in a single node

  - Configure parameters (see Parameter Setup section) in the file ~/ibenchjs/exector/runRIBench_single_cluster.sh
  - Specify the test application endpoint (get_urls) and node's hostname (node_arr) running the benchmark service in the file ~/ibenchjs/exector/runRIBench_single_cluster.sh
  - Configure parameters (see Parameter Setup section) in the YAML file ~/ibenchjs/templets/docker-compose_ri_single_cluster.yml
  - execute the command
```
 ./exector/runRIBench_single_cluster.sh
```
- Case 3: benchmark the horizontal scaling strategy in multiple nodes
  - Configure parameters (see Parameter Setup section) in the file ~/ibenchjs/exector/runRIBench_mul.sh
  - Specify the test application endpoint (get_urls) and node's hostname (node_arr) running the benchmark service in the file ~/ibenchjs/exector/runRIBench_mul.sh
  - Configure parameters (see Parameter Setup section) in the YAML file ~/ibenchjs/templets/docker-compose_ri_mul.yml
  - execute the command
```
 ./exector/runRIBench_mul.sh
```
# Sever Setup
The server side runs the RC component, the register component with sample test applications, and the private registry.

## Prerequisites
Download and install Node.js from https://nodejs.org/en/download/
## Parameter Setup
- Configure the JSON file collector/host.json, in which users specify which nodes run the benchmark service stack
- remote_user: defines the username in the remote server (worker nodes)
- ubuntu_passd: defines the password in the remote server (worker nodes)
## Private Registry Setup
We setup a private registry in the manager node and push the benchmark service image to it; in turn, any work node can pull the image from it. To this end, we need to follow the steps below:
- Step 1: create a certificate with the OpenSSL-Tool by running the following commands
```
mkdir registry_certs
 openssl req -newkey rsa:4096 -nodes -sha256 \
               -keyout registry_certs/domain.key -x509 -days 356 \
               -out registry_certs/domain.cert
 Generating a 4096 bit RSA private key
 .......................++
 ..........................................................................................................++
 writing new private key to 'registry_certs/domain.key'
 -----
```
You are about to be asked to enter information that will be incorporated into your certificate request. What you are about to enter is what is called a Distinguished Name or a DN. There are quite a few fields but you can leave some blank. For some fields there will be a default value, If you enter '.', the field will be left blank. Pay attention to the value of Common Name because it is important as this is the server host name. 
```
Country Name (2 letter code) [AU]:
 State or Province Name (full name) [Some-State]: 
 Locality Name (eg, city) []: 
 Organization Name (eg, company) [Internet Widgits Pty Ltd]: 
 Organizational Unit Name (eg, section) []:
 Common Name (e.g. server FQDN or YOUR name) []: HOST_IP:HOST_PORT/ibench
 Email Address []:
 
 ls registry_certs/
 domain.cert domain.key
```
Finally you have two files:
-- domain.cert: this file can be handled to the client using the private registry
-- domain.key: this is the private key which is necessary to run the private registry with TLS
- Step 2: Run the Private Docker Registry with TLS
```
 docker run -d -p xxxx:xxxx \
  -v $(pwd)/registry_certs:/certs \
  -e REGISTRY_HTTP_TLS_CERTIFICATE=/certs/domain.cert \
  -e REGISTRY_HTTP_TLS_KEY=/certs/domain.key \
  --restart=always --name registry registry:2
  ```
- Step 3: Access the private registry in the manager node from a worker node
The certificate file "domain.cert" must be located on the worker nodes in a file. Therefore, we run the following commands in the worker nodes,
```
 mkdir -p /etc/docker/certs.d/xxx.xxx.xxx.xxxx:xxxx
 cp domain.cert /etc/docker/certs.d/xxx.xxx.xxx.xxxx:xxxx/ca.crt 
 service docker restart
 Note: the public key domain.cert is located in the manager node; you can run cat registry_certs/domain.cert from the manager node, 
 and then copy and paste it to /etc/docker/certs.d/xxx.xxx.xxx.xxx:xxxx in the worker node.
```
## Testing
In this testing, the manager node runs the private registry, the RC component; the other worker nodes run the benchmark service. Note: the manager node does NOT run the benchmark service.

- Users need to copy the whole directory /benchmarks and /collector to the manager node (192.168.1.42); they are /home/ubuntu/nodejs/benchmarks/ and /home/ubuntu/nodejs/collector
- Users setup the private registry (See private registry setup section)
- go into the directory /benchmarks by executing
```
 cd benchmarks
```
- Create a benchmark service image by running
```
 docker build -t ibench -f Dockerfile-benchmark .
```
- Tag the benchmark service image to "xxx.xxx.xxx.xxx:xxxx/ibench" by running the command
```
 docker tag ibench xxx.xxx.xxx.xxx:xxxx/ibench
```
Note: the tag name follows the pattern IP_address_and_port_of_the_private_registry_server/image name. In this testing, we setup the private registry in the manager node and assign port 5001 to the private registry

- Push the image to the private registry by running
```
 docker push xxx.xxx.xxx.xxx:xxxx/ibench
```
- Pull the benchmark service image to nodes that run the benchmark service by running
```
 docker pull xxx.xxx.xxx.xxx:xxxx/ibench
```
For example, we plan to ask worker3 to run the benchmark service, then we go to the terminal of worker3 and run the above command to pull the image

- Configure and start the RC component in the manager node:
  - Users configure the host.json file in the director /collector (See Parameter Setup section)
  - Users configure the variable remote_user and ubuntu_passd in the /collector/rcCollector.js. We assume all worker nodes have the same username and password
  - Users start the RC component by running
```
 node nodejs/collector/rcCollector.js &
 ```
# Extend Benchmark Test Applications
A set of sample resource-intensive benchmark test applications are integrated into Ibenchjs. Moreover, Ibenchjs also supports users to add their customized benchmark test applications. In the initial implementation, users have to do it manually. The instructions are listed below,

- Put the customized benchmark test application to the directory ~/ibenchjs/benchmarks/apps/
- Re-write your code to make it a test application module, for example,
```
 exports.test_app_name = function test_app_name(req, res){	
   // Your source code here
 }   
```
- Import your test application module in the register component.
  - Open ~/ibenchjs/benchmarks/benchmarks.js
  - write code inside the function startSingleApp()
```
 var test_app_name = require('./app/test_app_name');
```
- write the code to call the test application inside the function startSingleApp()
```
 app.get('/endpoint', callback/your_test_application_module);
 Note: if the request is sent using the post or other method, code it as,
 app.HTTP_METHOD('/endpoint', callback/your_test_application_module);
```
