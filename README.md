# PEGGY INPUT

An HTML <input> element that provides completion based on a [Peggy](https://peggyjs.org/) PEG grammar.

![PeggyInput](docs/peggy-input.gif)

## Usage

Call `PeggyInput` with the jQuery input element and a javascript object with:

- grammar: A function that takes *the name* of an instance of PeggyInput and returns a Peggy grammar to use for completion. The name of the PeggyInput instance can be used in the grammar source to access a PeggyInput instance properties and methods.
- completers: A javascript object to use for matching completions.

### Examples

#### Assignments language

Edit a mini-language for assignments. There are users and groups of users.
The language has expressions like:
- everyone but @Peter
- members of Management but @John
- ...

Specify the Peggy grammar:

```javascript
var grammar = function (peggyInput) {
          return `start = assignment
assignmentgroup = "everyone" / groupmembers
assignment = g:assignmentgroup " " "but " as:assignees { return [g, {'not': as}] } / assignees
assignee = "everyone" / user / groupmembers
assignees = a:assignee WS "," WS as:assignees { return [a].concat(as) } / a:assignee { return [a] }
groupmembers = "members of " groups:groups { return {'membersOf':groups} }
groups = g:group WS "," WS gs:groups { return [g].concat(gs) } / g:group { return [g] }
group "group" = w1:word " " w2:word &{ let w = w1 + " " + w2; return _.includes(${peggyInput}.completers.group, w); } { return w1 + " " + w2 } / w:word &{ return _.includes(${peggyInput}.completers.group, w) } { return w }
user = "@" username:username { return {'user':username} }
username "username" = username:name &{${peggyInput}.setPartialInput(username); return _.includes(${peggyInput}.completers.username, username)} { return username }
WS = [ \t]*
word = $[a-z]i+
name = word:word " " name:name { return word + " " + name } / word
`;
      };
```

Specify the completers. We need to complete for users and groups:

```javascript
var users = ['Mariano Montone', 'Asgeir Bjorlykke', 'Martin Montone', 'Fernando Berretti'];
var groups = ['Management', 'Administration', 'Human Resources'];
```

Instantiate the HTML input element:

```html
<input id="input" type="text" style="width: 400px;"></input>
```

```javascript
PeggyInput($('#input'),
          {
              'grammar': grammar,
              'completers': {
                  'username' : users,
                  'group' : groups
              }
          }
      );
```
