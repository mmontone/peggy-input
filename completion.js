// require.resolve('peggy');
var PEG = require('peggy');
var _ = require('lodash');

var parser = PEG.generate("start = ('a' / 'b')+");
parser.parse('ab');
parser.parse('abd');

var parser = PEG.generate("exp = ('a' / 'b')+");

var grammar = `start = assignment
assignment = concrete WS "but" WS concrete / concrete
concrete = "everyone" / users
groupmembers = ("members" / "member") " of " groups
users = groupmembers / user WS "," WS users / user
groups = group WS "," WS groups / group
group "group" = word
user = "@" username
username "username" = word
WS = [ \t]*
word = $[a-z]i+
`;

var parser = PEG.generate(grammar);

parser.parse('everyone');
parser.parse('@Mariano');
parser.parse('Group A');
parser.parse('member of GroupA');
parser.parse('members of GroupA');
parser.parse('member of GroupB but @Mariano');
parser.parse('everyone but @Asgeir');
parser.parse('everyone but member of ');
parser.parse('member of ');
parser.parse('@Lolo'); // User
parser.parse('@Asgeir, @Mariano');
parser.parse('everyone but @Asgeir, @Mariano');
parser.parse('everyone but @Mariano, member of GroupA');
parser.parse('everyone but @Mariano, members of GroupA, GroupB');

parser.parse('@');
parser.parse('');

var completers = {
    'username' : ['Mariano', 'Asgeir'],
    'group' : ['Group A', 'Group B']
};

function selectCompletion(completion) {
    if(completers[completion] !== undefined) {
        return completers[completion];
    }
    else {
        return completion;
    }
}

function complete(input) {
    try {
        parser.parse(input)
    }
    catch(syntaxError) {
        var completions = [];
        let expected = _.uniqWith(syntaxError.expected, _.isEqual);
        expected.forEach(function (expectation) {
            switch (expectation.type) {
            case 'literal':
                completions.push(expectation.text);
                break;
            case 'other':
                completions.push(expectation.description);
                break;
            }
        });
        
        return {error: syntaxError.expected, completions: completions}; 
    }
    return {error:null, completions: []};
}

complete('@');
complete('34');
complete('');
complete('everyone');
complete('member of ');
complete('everyone but @');
complete('@Asgeir, ');

selectCompletion(complete('@').completions[0]);
selectCompletion(complete('member of ').completions[0]);
selectCompletion(complete('every').completions[0]);
selectCompletion(complete('everyone but').completions[0]);
selectCompletion(complete('member of GroupA, ').completions[0]);

complete
assert(22);
assert(undefined, 'Undefined!!');
assert(null, 'Nulo!');

assert(_.isEqual(complete('@').completions, ['username']), 'Should complete user list');
assert(_.isEqual(complete('').completions, ['username']), 'Should complete user list'); //fail
