stxinput.js:
	browserify script.js > stxinput.js
stxinput.min.js: stxinput.js
	uglifyjs stxinput.js > stxinput.min.js
clean:
	rm -f stxinput.js
rebuild: clean stxinput.js stxinput.min.js
