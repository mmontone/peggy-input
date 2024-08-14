all: completerblock.js dist/peggy-input.js dist/peggy-input.min.js
completerblock.js:
	npx peggy completerblock.peggy
dist/peggy-input.js:
	browserify peggy-input.js > dist/peggy-input.js
dist/peggy-input.min.js: peggy-input.js
	uglifyjs dist/peggy-input.js > dist/peggy-input.min.js
clean:
	rm -f completerblock.js
	rm -f dist/peggy-input.js
	rm -f dist/peggy-input.min.js
rebuild: clean all
