start = els:(completerBlock / .)* { return els.join('') }
completerBlock = "@{" ws body:completerBody ws "}" { return "&{return peggyInput._grammarCompleter(" + body + ")}" }
completerBody = completerName:word ws "," ws completerVar:word { return "'" + completerName + "'," + completerVar } 
                / completerVarName:word { return "'" + completerVarName + "'," + completerVarName }
word = $[a-z]i+
ws = [ \t]*