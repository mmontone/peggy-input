all: completerblock.js dist/peggy-input.js dist/peggy-input.min.js docs/peggy-input.js
completerblock.js:
	npx peggy completerblock.peggy
dist/peggy-input.js:
	npx browserify peggy-input.js > dist/peggy-input.js
dist/peggy-input.min.js: peggy-input.js
	npx uglifyjs dist/peggy-input.js > dist/peggy-input.min.js
docs/peggy-input.js: dist/peggy-input.js
	cp dist/peggy-input.js docs/peggy-input.js
clean:
	rm -f completerblock.js
	rm -f dist/peggy-input.js
	rm -f dist/peggy-input.min.js
	rm -f docs/peggy-input.js
rebuild: clean all
start-demo:
	npx http-server docs
