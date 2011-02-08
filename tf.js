/*

	Usage:
		1) Evaluate source code directly
			e.g. TitleFormatting(environment, "aaa%title%bbb");

		2) Parse source code, then execute object code
			e.g. var ocode = TitleFormatting.Prepare("aaa%title%bbb");
			     var result = TitleFormatting(environment, ocode);
	
	Environment object:
		Environment object provides functions($~~) and fields(%~~%).
		e.g. var env = {func:{"if":TFIf,"if2":TFIf2}, fields:{title:"TITLE"}};
	
	TitleFormatting Function:
		TitleFormatting Function receives environment and list of arguments. Arguments are code object fragment.
		TF Function should return TF Result object.
		e.g. function TFGreater(env, args){
			var x = args[0];
			var y = args[1];
			return new TitleFormatting.Result("", (TitleFormatting.Eval(env,x) > TitleFormatting.Eval(env,y)));
		}
	
	TitleFormatting Result Object:
		TitleFormatting Result Object is combination of string and boolean.
		Boolean flag indicates field(%~~%) expansion successed or not.
		[ ] operator returns "" if flag is false.

*/
var TitleFormatting = (function(){
	// Title formatting Result object
	var TFResult = function(str,success){
		this.str = str;
		this.success = success;
	}
	TFResult.prototype.toString = function(){return this.str;};

	// Title formatting Token objects
	// TF Function eg. $if
	var kTFFunc = function(name){
		this.name = name;
	}
	kTFFunc.prototype.toString = function(){return "#func " + this.name;};

	// TF Field eg. %isPlaying%
	var kTFField = function(key){
		this.key = key;
	}
	kTFField.prototype.toString = function(){return "%" + this.key + "%";};

	var kTFComma = new Object();
	kTFComma.toString = function(){return "#,";};

	var kTFOpen = new Object();
	kTFOpen.toString = function(){return "#(";};

	var kTFClose = new Object();
	kTFClose.toString = function(){return "#)";};

	var kTFAnyOpen = new Object();
	kTFAnyOpen.toString = function(){return "#[";};

	var kTFAnyClose = new Object();
	kTFAnyClose.toString = function(){return "#]";};

	var tokenize = function(src){
		var tokens = [];
		var m = null;
		while(src.length > 0){
			if(m = src.match(/^\$[a-z]+/i)){
				tokens.push(new kTFFunc(m[0].substr(1)));
				src = src.replace(m[0],"");
			} else if(m = src.match(/^\%([a-z_]+)\%/i)){
				tokens.push(new kTFField(m[1]));
				src = src.replace(m[0],"");
			} else if(src.match( /^\(/ )){
				tokens.push(kTFOpen);
				src = src.substr(1);
			} else if(src.match( /^\)/ )){
				tokens.push(kTFClose);
				src = src.substr(1);
			} else if(src.match( /^,/ )){
				tokens.push(kTFComma);
				src = src.substr(1);
			} else if(src.match( /^\[/ )){
				tokens.push(kTFAnyOpen);
				src = src.substr(1);
			} else if(src.match( /^\]/ )){
				tokens.push(kTFAnyClose);
				src = src.substr(1);
			} else {
				tokens.push(src.charAt(0));
				src = src.substr(1);
			}
		}
		return tokens;
	}

	var pushTextToken = function(current, token){
		if(current.length==0){
			current.push(token);
		}else{
			if(typeof(current[current.length-1]) == "string" || current[current.length-1] instanceof String){
				current[current.length-1] += token;
			}else{
				if(current[current.length-1] == null)current.pop();
				current.push(token);
			}
		}
	}
	var makeTree = function(tokens){
		var tree = [];
		tree.parent = null;
		var current = tree;
		for(var i=0,l=tokens.length;i<l;i++){
			var token = tokens[i];
			if(token instanceof kTFFunc){
				var block = [];
				block.func = token;
				block.parent= current;
				if(current[current.length-1] == null)current.pop();
				current.push(block);
				current = block;
			}else if(token instanceof kTFField){
				current.push(token);
			}else if(token == kTFOpen){
				var block = [];
				block.parent = current;
				current.hasArgs = true;
				current.push(block);
				current = block;
			}else if(token == kTFClose){
				current = current.parent;
				current = current.parent;
			}else if(token == kTFComma){
				if(current.parent && current.parent.func){
					current = current.parent;
					var block = [];
					block.parent = current;
					current.push(block);
					current = block;
				}else{
					pushTextToken(current, ",");
				}
			}else if(token == kTFAnyOpen){
				var block = [];
				block.any = true;
				block.parent= current;
				if(current[current.length-1] == null)current.pop();
				current.push(block);
				current = block;
			}else if(token == kTFAnyClose){
				current = current.parent;
			}else{
				pushTextToken(current, token);
			}
		}
		return tree;
	}

	function evalTF(env, codeFragment){
		var result = [];
		var success = false;

		// null
		if(codeFragment == null)return new TFResult("",false);

		// literal
		if(typeof(codeFragment) == "string" || codeFragment instanceof String){
			return new TFResult(codeFragment, false);
		}

		// result object
		if(codeFragment instanceof TFResult){
			return codeFragment;
		}
		
		// field
		if(codeFragment instanceof kTFField){
			var val = env.fields[codeFragment.key];
			if(val){
				return new TFResult(val, true);
			}else{
				return new TFResult("?", false);
			}
		}

		// codeFragment list
		if(codeFragment.func) { // list of arguments (function call)
			if(!codeFragment.hasArgs) return new TFResult("", false);
			var name = codeFragment.func.name;
			var func = env.func[name];
			if(func){
				var res = func(env, codeFragment);
				success = success || res.success;
				result.push(res);
			}else{
				if(env.function_missing && env.function_missing instanceof Function){
					var res = env.function_missing(name, env, codeFragment);
					success = success || res.success;
					result.push(res);
				} else {
					result.push(new TFResult("[UNKNOWN FUNCTION " + name + "]", false));
				}
			}
		} else {
			for(var i=0,l=codeFragment.length;i<l;i++){
				var res = evalTF(env,codeFragment[i]);
				success = success || res.success;
				result.push(res);
			}
		}
		if(codeFragment.any && !success) return new TFResult("", false);
		return new TFResult(result.join(""),success);
	}
	
	// closure object
	var c = function(env, code){
		if(code instanceof Array){
			// if code is object code
			return evalTF(env, code);
		}else{
			// if code is source code
			return evalTF(env, makeTree(tokenize( code )));
		}
	}
	
	c.Eval = evalTF;
	c.Result = TFResult;
	c.Prepare = function(code) { return makeTree(tokenize(code)); };
	
	return c;
})();
