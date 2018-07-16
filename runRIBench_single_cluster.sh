#/bin/bash

# This script is to conduct experiment running on docker swarm
REMOTE_SERVER_DIR="/home/ubuntu/nodejs/benchmarks/"
TEMPLET_DIR="./templets/"
STACK_NAME="sbench"
CONFIG="docker-compose.yml"
CONFIG_TEMP="docker-compose_ri_single_cluster.yml"
RSA_PATH=$HOME"/.ssh/scp_rsa "
REMOTE_USERNAME="ubuntu"
MANAGER_NODE_IP="192.168.1.42"
RC_SERVER_PORT="3000"
SERVER_PORT="9001"
REMOTE_SERVER_IP=$REMOTE_USERNAME"@"$MANAGER_NODE_IP
RC_SERVER_IP=$MANAGER_NODE_IP":"$RC_SERVER_PORT
SCP_DES_PATH=$REMOTE_SERVER_IP":"$REMOTE_SERVER_DIR
F_URL=$RC_SERVER_IP"/startperf?flag=0"
S_URL=$RC_SERVER_IP"/startperf?flag=1"

# Fire requests parameters
duration=100
jmeter_path="executor/apache-jmeter-3.2/bin/jmeter"
jmeter_test_plan="configs/test_plan.jmx"
jmeter_post_test_plan="configs/post_test_plan.jmx"
jmeter_upload_file_path="images/two_kb_image.png"
RESULT_FILE="result_single_cluster.txt"
get_urls=( "/getmembound" "/getdiskbound" "/getcpubound" "/getnetinbound" "/getnetoutbound" )
node_arr=( "worker3" "worker20" "worker6" "worker1" "worker20" )

# Change number of CPUs in configure file
change_cpu_num(){
	cpu_num=$1
	awk -v cpu_num=$cpu_num 'BEGIN{FS=" "} {sub(/- CPU_COUNT=[0-9]*/, "- CPU_COUNT="cpu_num)}1' $CONFIG > tmp.yml
	mv tmp.yml $CONFIG
}

#Change node placement
change_node_placement(){
	node=$1
	awk -v node="[node.hostname=="$node"]" 'BEGIN{FS=" "} {sub(/\[node.hostname==.+/, node)}1' $CONFIG > tmp.yml 
	mv tmp.yml $CONFIG
}

# Deploy stack and check if all services are up
deploy_stack_counter=0
deploy_stack(){
	containers=$1
	# Deploy new stack to Swarm
	echo "Start to deploy stack..."
	ssh -i $RSA_PATH $REMOTE_SERVER_IP docker stack deploy -c $REMOTE_SERVER_DIR$CONFIG $STACK_NAME
	while [ $? -ne 0 ]; do
		sleep 2
		echo "Deploy Fail to deploy stack! Try again!"
		ssh -i $RSA_PATH $REMOTE_SERVER_IP docker stack deploy -c $REMOTE_SERVER_DIR$CONFIG $STACK_NAME
	done
	echo "Finished deploying stack..."
	sleep 5
	# Check if all services are up or not
	stat_num=`ssh -i $RSA_PATH $REMOTE_SERVER_IP docker stack ps $STACK_NAME | 
			awk 'BEGIN{FS="[[:space:]]+"; rCount=0} {if ( $5=="Running" ) {rCount=rCount+1}} END{print rCount}'`
	while [ $stat_num -lt $containers ]; do
		deploy_stack_counter=$((deploy_stack_counter+1))
		echo "Fail to start the stack "$stat_num"/"$containers
		if [ $deploy_stack_counter -gt 5 ]
		then			
			echo "Deploy stack has tried "$deploy_stack_counter" times; exiting..."
			deploy_stack_counter=0
			exit 1
		fi
		sleep 2		
		stat_num=`ssh -i $RSA_PATH $REMOTE_SERVER_IP docker stack ps $STACK_NAME | 
				awk 'BEGIN{FS="[[:space:]]+"; rCount=0} {if ( $5=="Running" ) {rCount=rCount+1}} END{print rCount}'`		
	done
	echo "There are "$stat_num"/"$containers" services up"
}

# Removing stack from swarm
remove_stack(){
	echo "Start to remove stack..."
	ssh -i $RSA_PATH $REMOTE_SERVER_IP docker stack rm $STACK_NAME
	while [ $? -ne 0 ]; do
		echo "Fail to remove stack! Try again!"
		ssh -i $RSA_PATH $REMOTE_SERVER_IP docker stack rm $STACK_NAME
	done
	echo "Finish removing stack..."
}

# Start RC server
startRC(){
	ssh -o StrictHostKeyChecking=no -i $RSA_PATH $REMOTE_SERVER_IP node ./nodejs/RTCollector/rcCollector.js &
}

handshake_count=0
handshake(){
	echo "Start handshake"
	flag=`curl -s $RC_SERVER_IP"/" | awk '{print $1}'`
	while [ "$flag" != "OK" ]; do
		handshake_count=$((handshake_count+1))
		echo "Handshake Failing, try again..."
		#startRC
		sleep 2
		if [ $handshake_count -gt 5 ]		
		then
			echo "Handshake has tried "$handshake_count" times! Exiting..."
			exit 1	
		fi
		flag=`curl -s $RC_SERVER_IP"/" | awk '{print $1}'`	
	done
	echo "Handshake finished"
}

# First RM collection
first_collection(){
	count=0
	echo "Start first collection"
	flag=`curl -s $F_URL | awk '{print $1}'`
	while [ "$flag" != "OK" ]; do
		count=$((count+1))
		echo "First collection Fails, try again... "
		sleep 2
		if [ $count -gt 5 ]
		then
			handshake
		fi
		flag=`curl -s $F_URL | awk '{print $1}'`		
	done
	echo "First collection finished"
}

# Second RM collection
second_collection(){
	count=0
	curl -s $S_URL
	while [ $? -ne 0 ]; do
		count=$((count+1))
		sleep 2
		if [ $count -gt 5 ]
		then
			break;	
		fi
		curl -s $S_URL	
	done
}

# Copy YAML file templet to current directory and overwrite it with previous one
cp $TEMPLET_DIR$CONFIG_TEMP .
mv $CONFIG_TEMP $CONFIG

for c in `seq 5 10 45` # Loop 1: varying concurrency
do
	for node in ${node_arr[*]} # Loop 2: varying different node placement
	do
		change_node_placement $node		
		for j in `seq 1 1 12` # Loop 3:  varying the number of CPUs 
		do
			change_cpu_num $j
			num_of_container=1
			num_of_container=$((num_of_container+0)) # if there are other services, add the number
			# Copy the YAML file docker-compose to manager node
			scp -i $RSA_PATH $CONFIG $SCP_DES_PATH
			
			for url in ${get_urls[*]} # Loop 4: varying the benchamark application names
			do
				for i in {1..5} # Loop 5:  loop the run times
				do
					current_time=`date +%s%N | cut -b1-13`
					jmeter_output_path="logs/"$current_time".jtl"
					# Remove the previous stack in the Swarm
					remove_stack
					sleep 15
					# deploy stack to swarm
					deploy_stack $num_of_container
					sleep 2
					# Start the banchmark job
					echo "Start "$i"st run"	
					sleep 5
					handshake
					sleep 1
					first_collection
					if [ "$url" == "/gethelloworld" ]
					then
						$jmeter_path -n -t $jmeter_post_test_plan -JnThreads=$c -Jtime=$duration -Jip=$MANAGER_NODE_IP -Jport=$SERVER_PORT -JfilePath=$jmeter_upload_file_path -l $jmeter_output_path -Jpath=$url						
					else
						$jmeter_path -n -t $jmeter_test_plan -JnThreads=$c -Jtime=$duration -Jip=$MANAGER_NODE_IP -Jport=$SERVER_PORT -l $jmeter_output_path -Jpath=$url		
					fi								
					second_collection > analyzer/rc_metric.json
					metric=`node analyzer/rcAnalyzer.js $jmeter_output_path`
					echo "Finished All Requests..."
					echo $i"--,"$c","$j","$url","$metric >> $RESULT_FILE
					rm $jmeter_output_path
					sleep 5
				done # End Loop5
				echo -e "\n" >> $RESULT_FILE
			done # End Loop4
		done # end loop 3
		sleep 2
	done # end loop2
done # end loop1
