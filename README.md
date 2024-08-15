# PEGGY INPUT

An HTML input element that provides syntax directed editing and completion based on a [Peggy](https://peggyjs.org/) PEG grammar.

![PeggyInput](docs/peggy-input.gif)

## Usage

Call `PeggyInput` with the jQuery input element and a javascript object with:

- grammar: A Peggy grammar with completion blocks for some of the rules.
- completers: A javascript object to use for matching completions.

### Completion blocks

Peggy supports two types of blocks:
1. Action blocks for processing rules' components and returning a Javascript result for them. They have the syntax: `{ <code> }`.
2. Predicate blocks for predicates in rules. They have syntax: `&{ <code> }` and `!{ <code> }`.

`peggy-input` introduces a new type of block, a completion block. 
It has syntax: `@{ <completerName> [,<variableName> }`.
That means complete the current rule using the completer named `completerName` passed in the `PeggyInput` initialization.

For instance, a rule for user completion looks like:
```
user = "@" username:username { return {'user':username} }
username "username" = username:name @{ username } { return username }
```

The `username` rule uses a completion block `@{ username }` meaning "complete from the username completion list".
When `PeggyInput` is initialized it needs to be passed the `username` completion list: 
```javascript
'completers': {
     'username' : ['Peter', 'John', 'Daniel']
}
```

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
spacedgroupname = w1:word " " w2:word { return w1 + " " + w2 }
group "group" =  group:spacedgroupname @{ group } / group:word @{ group }
user = "@" username:username { return {'user':username} }
username "username" = username:name @{ username } { return username }
WS = [ \t]*
word = $[a-z]i+
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
                  'username' : users,
                  'group' : groups
              }
          }
      );
```

### How it works

The algorithm is based on the following: try to parse the input using the given PEG grammar. When an error ocurrs, that error contains the expected input at point. The expected input is used to provide the completions.

### Development

Run `make`, `make clean`, `make rebuild`.

### Demo

Run `make start-demo`.
