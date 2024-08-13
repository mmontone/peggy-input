all: dist/peggy-input.js dist/peggy-input.min.js
dist/peggy-input.js:
	browserify peggy-input.js > dist/peggy-input.js
dist/peggy-input.min.js: peggy-input.js
	uglifyjs dist/peggy-input.js > dist/peggy-input.min.js
clean:
	rm -f dist/peggy-input.js
	rm -f dist/peggy-input.min.js
rebuild: clean all
