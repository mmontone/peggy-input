all: dist/peggy-input.js dist/peggy-input.min.js docs/peggy-input.js
dist/peggy-input.js:
	npx browserify peggy-input.js > dist/peggy-input.js
dist/peggy-input.min.js: peggy-input.js
	npx uglifyjs dist/peggy-input.js > dist/peggy-input.min.js
docs/peggy-input.js: dist/peggy-input.js
	cp dist/peggy-input.js docs/peggy-input.js
clean:
	rm -f dist/peggy-input.js
	rm -f dist/peggy-input.min.js
	rm -f docs/peggy-input.js
rebuild: clean all
docs/users.json:
	wget -O docs/users.json 'https://randomuser.me/api/?inc=name,location&results=500'
start-demo:
	npx http-server docs
