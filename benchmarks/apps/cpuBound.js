//const NUM = 982451653;
//const NUM = 10971096049;
exports.isPrime = function isPrime(req, res, prime){	
	//var value = Math.sqrt(NUM);
	var value = Math.sqrt(prime);
	for(var i = 2; i < value; i++) {
		if(value % i === 0) {
			res.status(200).send("OK");
			return false;
        }
    }
	res.status(200).send("OK");
    return value > 1;
}

