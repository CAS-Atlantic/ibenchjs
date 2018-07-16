function generate_random_text(l){
	var len = Math.floor(l);
	var possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";	
	var text = possible.charAt(Math.floor(Math.random() * possible.length));
	var result = text.repeat(len);
	return result;
}

console.log(generate_random_text(30000));