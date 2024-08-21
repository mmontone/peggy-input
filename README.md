# PEGGY INPUT

An HTML input element that provides syntax directed editing and completion based on a [Peggy](https://peggyjs.org/) PEG grammar.

![PeggyInput](docs/peggy-input.gif)

## Usage

Call `PeggyInput` with the jQuery input element and a javascript object with:

- grammar: A Peggy grammar with completion blocks for some of the rules.
- completers: A javascript object to use for matching completions.

The `completers` object contains subobjects that specified "completion rules".
A completion rule is a special rule with a Peggy `rule`, plus the completion `candidates`.
The Peggy grammar is expanded using the completers object.

Example:

```javascript
let users = ['Mariano Montone', 'Asgeir Bjørlykke', 'Martin Montone'];
let groups = ['Management', 'Administration', 'Human Resources'];

({
    'completers': {
       'username' : {
           'rule' : 'name',
           'candidates' : users
       },
       'group' : {
          'rule' : 'name',
          'candidates' : groups
       }
    }
})
```

That means two Peggy rules are added to the original grammar.
A `username` rule, that is parsed using the `name` rule.
And a `group` rule, that is also parsed using `name`.

The `candidates` contain an array of completion candidates.
When one of those rules match, they are completed using the specified candidates.

### Examples

#### Assignments language

Edit a mini-language for assignments. There are users and groups of users.
The language has expressions like:
- everyone but @Peter
- members of Management but @John
- ...

Specify the Peggy grammar:

```javascript
start = assignment
assignmentgroup = "everyone" / groupmembers
assignment = g:assignmentgroup " " "but " as:assignees { return [g, {'not': as}] } / assignees
assignee = "everyone" / user / groupmembers
assignees = a:assignee WS "," WS as:assignees { return [a].concat(as) } / a:assignee { return [a] }
groupmembers = "members of " groups:groups { return {'membersOf':groups} }
groups = g:group WS "," WS gs:groups { return [g].concat(gs) } / g:group { return [g] }
user = "@" username:username { return {'user':username} }
WS = [ \t]*
word = !"but" cs:(![ ,@] .)+ { return cs.map(c => c[1]).join('') }
name = word:word " " name:name { return word + " " + name } / word
```

Create an HTML input element:

```html
<input id="input" type="text" style="width: 400px;"></input>
```

Instantiate a PeggyInput passing the grammar and completers as options:

```javascript
var users = ['Mariano Montone', 'Asgeir Bjorlykke', 'Martin Montone', 'Fernando Berretti'];
var groups = ['Management', 'Administration', 'Human Resources'];
PeggyInput('#input',
          {
              'grammar': grammar,
              'completers': {
                  'username' : {
                      'rule' : 'name',
                      'candidates' : users
                  },
                  'group' : {
                      'rule' : 'name',
                      'candidates' : groups
                  }
              }
          }
      );
```

### How it works

The algorithm is based on the following: try to parse the input using the given PEG grammar. When an error ocurrs, that error contains the expected input at point. The expected input is used to provide the completions.

### Development

`npm install`

Run `make`, `make clean`, `make rebuild`.

#### Debug logs

`peggyInputInstance.logger.setLevel('debug');`

### Demo

`npm install`

Run `make start-demo`.
