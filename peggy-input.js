//const _ = require('lodash');
// Use minified module versions to reduce build size
const _ = require('./node_modules/lodash/lodash.min.js');
const peggy = require('peggy');
const loglevel = require('loglevel');

/* Utilities */

// Extension for getting cursor position in input field
function getCursorPosition (input) {
    if ('selectionStart' in input) {
        // Standard-compliant browsers
        return input.selectionStart;
    } else if (document.selection) {
        // IE
        input.focus();
        var sel = document.selection.createRange();
        var selLen = document.selection.createRange().text.length;
        sel.moveStart('character', -input.value.length);
        return sel.text.length - selLen;
    }
}

function setCursorPosition (input, pos) {
    input.selectionStart = pos;
    input.selectionEnd = pos;
}

function insertAfter (referenceNode, newNode) {
    referenceNode.parentNode.insertBefore(newNode, referenceNode.nextSibling);
}

// TODO: implement copying from Peggy generate-js.js file
function classEscape (s) {
    return s;
}

function describeExpectation(exp) {
    switch(exp.type) {
        case 'literal':
            return exp.text;; // TODO: escape text
        case 'class':
            var escapedParts = exp.parts.map(function(part) {
                return Array.isArray(part)
                    ? classEscape(part[0]) + "-" + classEscape(part[1])
                    : classEscape(part);
            });

            return "[" + (exp.inverted ? "^" : "") + escapedParts.join("") + "]";
        case 'any':
            return "any character";
        case 'end':
            return "end of input"
        case 'other':
            return exp.description
    }
}

function describeExpected(expected) {
    var descriptions = expected.map(describeExpectation);
    var i, j;

    descriptions.sort();

    if (descriptions.length > 0) {
        for (i = 1, j = 1; i < descriptions.length; i++) {
            if (descriptions[i - 1] !== descriptions[i]) {
                descriptions[j] = descriptions[i];
                j++;
            }
        }
        descriptions.length = j;
    }

    switch (descriptions.length) {
        case 1:
            return descriptions[0];

        case 2:
            return descriptions[0] + " or " + descriptions[1];

        default:
            return descriptions.slice(0, -1).join(", ")
                + ", or "
                + descriptions[descriptions.length - 1];
    }
}

/* Insert string at position */
function insertString(str, insertStr, position) {
    return str.substring(0, position) + insertStr + str.substring(position);
}

/* PeggyInput object */
function PeggyInput(input, opts) {
    this.logger = loglevel.getLogger('peggy-input');
    this.partialInput = null;
    this.value = null;
    this.error = null;
    this.candidatesIndex = {};
    this.init(input, opts).then(this.updateStatus.bind(this));
    return this;
}

/* API */
PeggyInput.prototype.isValid = function () {
    return this.error == null;
};

PeggyInput.prototype.getValue = function () {
    return this.value;
};

PeggyInput.prototype.getError = function () {
    return this.error;
};

PeggyInput.prototype.getInput = function () {
    return this.input;
};

PeggyInput.prototype.getExpectedDescription = function (err) {
    let syntaxError = err || this.getError();
    let expected = syntaxError.expected;
    return describeExpected(expected);
};

PeggyInput.prototype.formatErrorMsg = function () {
    if (this.errorMsgFormatter) {
        return this.errorMsgFormatter(this, this.getError());
    } else {
        return this.getError().message;
    }
};

/* Update the status of the PeggyInput based on the current input value */
PeggyInput.prototype.updateStatus = function () {

    /* If the input is empty and should not be validated */
    if (!this.input.value && !this.validateWhenBlank) {
        this.value = null;
        this.error = null;
        this.syntaxErrorMsg.innerHTML = '';
        this.input.classList.remove('error');
        return;
    }

    /* To determine the status, try to parse current input */
    try {
        this.syntaxErrorMsg.innerHTML = '';
        this.value = this.parser.parse(this.input.value, {
            peggyInput: this
        });
        this.error = null;
        this.input.classList.remove('error');
        if (this.getInput().willValidate) {
            this.getInput().setCustomValidity('');
        }
    }
    catch (syntaxError) {
        this.logger.debug({syntaxError});
        this.value = null;
        this.error = syntaxError;
        let errorMsg = this.formatErrorMsg();
        this.syntaxErrorMsg.innerHTML = errorMsg;
        this.input.classList.add('error');
        if (this.getInput().willValidate) {
            this.getInput().setCustomValidity(errorMsg);
        }
    }

    if (this.changeHandler) {
        this.logger.debug('Triggering change handler');
        this.changeHandler(this);
    }
};

/* Destroy the PeggyInput instance */
PeggyInput.prototype.destroy = function () {
    this.syntaxErrorMsg.remove();
    this.completionsArea.remove();
    this.syntaxErrorMsg = null;
    this.completionsArea = null;
};

PeggyInput.prototype.matchCompletion = function (completion, input) {
    if (this.caseSensitive) {
        return _.startsWith(completion, input);
    }
    else {
        return _.startsWith(_.toLower(completion), _.toLower(input));
    }
};

PeggyInput.prototype.filterCompletions = function (completions, input) {
    return completions.filter(function (completion) {
        return this.matchCompletion(completion, input);
    }.bind(this));
};

/* The main function for providing the completions to the user */
PeggyInput.prototype.complete = function (input) {

    try {
        this.syntaxErrorMsg.innerHTML = '';
        this.value = this.parser.parse(input, {
            peggyInput: this
        });
        this.error = null;
    }
    catch(syntaxError) {
        this.logger.debug({syntaxError});
        this.value = null;
        this.error = syntaxError;
        var completions = [];
        let expected = _.uniqWith(syntaxError.expected, _.isEqual);

        if (this.input.value || this.validateWhenBlank) {
            this.syntaxErrorMsg.innerHTML = this.formatErrorMsg();
        }

        expected.forEach(function (expectation) {
            switch (expectation.type) {
                case 'literal':
                    completions.push(expectation.text);
                    break;
                case 'class':
                    completions = completions.concat(expectation.parts);
                case 'other':
                    completions.push(expectation.description);
                    break;
            }
        });

        _.remove(completions, (x) => _.isUndefined(x) || x == " " || x == "\t");

        this.logger.debug('Completions', completions);

        /* When the input matches a completer rule, expand the completion candidates */
        var expandedCompletions = [];
        completions.forEach(function (completion) {
            let completer = this.completers[completion];
            if (completer) { /* There's a completer for the completion. Expand candidates */
                let completionsCharCount = _.defaultTo(completer.charCount, this.completionsCharCount);

                /* Only expand if completions characters count is enough */
                if (!(completionsCharCount > 0) || (this.partialInput && this.partialInput.length >= completionsCharCount)) {
                    expandedCompletions = expandedCompletions.concat(this.getCandidatesLabels(completer.candidates));
                }
            } else {
                expandedCompletions = expandedCompletions.concat([completion]);
            }
        }.bind(this));

        completions = expandedCompletions;

        this.logger.debug('Expanded completions', completions);

        // Filter the possible options based on what was found unparsed
        // in the syntax error:
        let filter = this.partialInput || syntaxError.found;
        if (syntaxError.found) {
            completions = this.filterCompletions(completions, filter);
            this.logger.debug('Filtered completions: ', completions, 'with: ', filter);
        }

        this.partialInput = null;

        return {error: syntaxError.expected, completions: completions};
    }
    return {error:null, completions: []};
};

/* Fill the completions area with completions candidates */
PeggyInput.prototype.fillCompletions = function (completions) {
    var html = '';
    completions.forEach(function (completion) {
        html += `<option value="${completion}">${completion}</option>`;
    });
    this.completionsArea.innerHTML = html;
};

/* Update the completion area. Fill and also show or hide. */
PeggyInput.prototype.updateCompletions = function () {
    this.logger.debug('Updating completions');
    this.completionsArea.innerHTML = '';
    var inputText = this.input.value;
    var completions = this.complete(inputText).completions;
    if (completions.length > 0) {
        this.fillCompletions(completions);
        this.completionsArea.style.display = "block";
    } else {
        this.completionsArea.style.display = "none";
    }
};

/* A partial input is the input that the user entered, but that doesn't match the completion rule, yet. */
/* For example, in a 'username' completion rule position, the partial input is part of the username entered, but that is not complete, yet. */
PeggyInput.prototype.setPartialInput = function (pinput) {
    // For setting the partial input, check that the input matches
    // input value at cursor position (what the user is entering).
    let inputStr = this.input.value.substring(0, getCursorPosition(this.input));
    let userStr = inputStr.substring(inputStr.length - pinput.length, inputStr.length);
    if (pinput == userStr) {
        this.logger.debug('Setting partial input:', pinput);
        this.partialInput = pinput;
    }
};

/* Insert user selected completion into the input widget */
/* deleteChars is the number of characters to delete before cursor position */
PeggyInput.prototype.insertCompletion = function (completion, deleteChars = 0) {
    let cursorPosition = getCursorPosition(this.input);
    let inputStr = this.input.value;
    if (deleteChars > 0) {
        inputStr = inputStr.substring(0, cursorPosition - deleteChars) + inputStr.substring(cursorPosition);
        cursorPosition = cursorPosition - deleteChars;
    }
    this.input.value = insertString(inputStr, completion, cursorPosition);
    setCursorPosition(this.input, cursorPosition + completion.length);
    this.updateStatus();
};

/* The user selected a completion value */
PeggyInput.prototype.selectCompletion = function (completionVal) {

    let inputVal = this.input.value.substring(0, getCursorPosition(this.input));

    this.logger.debug('Completion selected', completionVal);

    // Try to match the completion repeatedly
    for (let pos = Math.max(0, inputVal.length - completionVal.length); pos < inputVal.length; pos++) {
        let prefix = inputVal.substr(pos, inputVal.length);
        let matcher = this.caseSensitive ?
            _.startsWith :
            (x, y) => _.startsWith(_.toLower(x), _.toLower(y));

        if (matcher(completionVal, prefix)) {
            // Found a prefix
            // Complete without the prefix
            this.insertCompletion(completionVal, prefix.length);
            this.updateCompletions();
            return;
        }
    }

    if (completionVal !== null) {
        this.insertCompletion(completionVal);
        this.updateCompletions();
    }
};

PeggyInput.prototype.keyUpHandler = function (ev) {
    //this.logger.debug(ev.key);
    switch(ev.key) {
        case 'ArrowDown':
            break;
        case 'ArrowUp':
            break;
        case 'Enter':
            this.selectCompletion(this.completionsArea.value);
            break;
        default: this.updateCompletions();
    }
};

PeggyInput.prototype.keyDownHandler = function (ev) {
    let selected = this.completionsArea.querySelector('option:checked');
    switch(ev.key) {
        case 'ArrowDown':
            if (selected === null) {
                this.completionsArea.querySelectorAll('option')[0].selected = 'selected';
            } else {
                selected.selected = false;
                if (selected.nextElementSibling) {
                    selected.nextElementSibling.selected = selected;
                }
            }
            // Prevent cursor from moving to the end
            ev.preventDefault();
            break;
        case 'ArrowUp':
            if (selected === null) {
                this.completionsArea.querySelectorAll('option')[0].selected = 'selected';
            } else {
                selected.selected = false;
                if (selected.previousElementSibling) {
                    selected.previousElementSibling.selected = selected;
                }
            }
            // Prevent cursor from moving to the beginning
            ev.preventDefault();
            break;
    }
};

PeggyInput.prototype.getCandidatesLabels = function (candidates) {
    return _.map(candidates, 'label');
};

PeggyInput.prototype.getCandidatesValues = function (candidates) {
    return _.map(candidates, 'value');
};

PeggyInput.prototype.testGrammarCompleterMatches = function (completerName, label) {
    let match = _.includes(this.getCandidatesLabels(this.completers[completerName].candidates), label);
    this.logger.debug('Completing', completerName, label, match);
    if (!match) {
        this.setPartialInput(label);
    }
    return match;
};

/* Build an index for completion candidates */
/* The index has candidate labels as keys and candidate values as values */
/* This is used from the grammar blocks to return the completion value of the selected completion */
PeggyInput.prototype.buildCandidatesIndex = function (completerName, completer) {
    let index = new Map();

    _.forEach(completer.candidates, function (candidate) {
        index.set(candidate.label, candidate.value);
    });

    this.candidatesIndex[completerName] = index;
};

/* Return value of the completion from its label */
PeggyInput.prototype.getCandidateValue = function (completerName, label) {
    return this.candidatesIndex[completerName].get(label);
};

PeggyInput.prototype.expandCompletionRule = function (completerName) {
    let completionMatchingPredicate = '';
    let completer = this.completers[completerName];
    let matchCompletion = _.defaultTo(completer.matchCompletion ,true);

    if (matchCompletion) {
        completionMatchingPredicate = `&{ return options.peggyInput.testGrammarCompleterMatches("${completerName}", ${completerName}) }`;
    }

    return `${completerName} "${completerName}" = ${completerName}:(${this.completers[completerName].rule})` + completionMatchingPredicate + `{ return options.peggyInput.getCandidateValue("${completerName}", ${completerName}) || ${completerName} }`;
}

/* Normalize an array of completion candidates to an array of objects with label and value members */
PeggyInput.prototype.normalizeCandidates = function (candidates) {
    if (!_.isArray(candidates)) {
        return candidates;
    }

    if (_.isEmpty(candidates)) {
        return candidates;
    }

    if (_.isString(candidates[0])) {
        /* An array of strings. Normalize to an object with label and value. */
        return _.map(candidates, function (label) {
            return {'label':label, 'value':label};
        });
    }

    /* Otherwise, assume an array of objects with label and value.*/
    /* TODO: check? */
    return candidates;
};

/* Get an array of candidates depending on how candidates were specified */
PeggyInput.prototype.resolveCandidates = function (candidates) {
    /* If a function, evaluate it. Expect a Promise */
    if (_.isFunction(candidates)) {
        return candidates();
    } else if (_.isString(candidates)) { /* If a string, treat as url and fetch */
        return fetch(candidates)
            .then(res => res.json());
    } else if (_.isArray(candidates)) {
        return Promise.resolve(candidates);
    } else {
        throw new Error('Invalid candidates:', candidates);
    }
};

/* Initialization function */
PeggyInput.prototype.init = function (inputElOrSel, opts) {

    if (_.isString(inputElOrSel)) {
        this.input = document.querySelector(inputElOrSel);
    }
    else {
        this.input = inputElOrSel;
    }

    let defaultOptions = {
        showSyntaxErrorMsg: true,
        validateWhenBlank: this.input.required,
        completionsCharCount : 0
    };

    opts = _.defaults(opts, defaultOptions);

    this.logger.debug('Grammar', opts.grammar);
    this.grammar = opts.grammar;
    this.completers = opts.completers;
    this.changeHandler = opts.onChange;
    this.errorMsgFormatter = opts.errorMsgFormatter;
    this.validateWhenBlank = opts.validateWhenBlank;
    this.completionsCharCount = opts.completionsCharCount;
    this.caseSensitive = _.defaultTo(opts.caseSensitive, false);

    let updateEvent = _.defaultTo(opts.updateEvent, 'change');
    this.input.addEventListener(updateEvent, this.updateStatus.bind(this));

    Object.keys(this.completers).forEach(function (completerName) {
        this.grammar += "\n";
        this.grammar += this.expandCompletionRule(completerName);
    }.bind(this));

    /* Fetch candidates if needed */
    let completers = _.values(this.completers);
    return Promise.all(_.map(completers, function (completer) {
        return this.resolveCandidates(completer.candidates);
    }.bind(this))).then(fetchedCandidates => {

        this.logger.debug('Fetched candidates', fetchedCandidates);

        /* Assign the fetched candidates */
        _.forEach(_.zip(completers, fetchedCandidates),
                  ([completer, candidates]) => {
                      completer.candidates = candidates;
                  });

        /* Normalize completion candidates */
        Object.keys(this.completers).forEach(function (completerName) {
            let completer = this.completers[completerName];
            completer.candidates = this.normalizeCandidates(completer.candidates);
            /* Build a reverse index for candidates, from label to value */
            this.buildCandidatesIndex(completerName, completer);
        }.bind(this))
    }).then(() => this.initUI(opts));
};

PeggyInput.prototype.initUI = function (opts) {

    this.logger.debug('Expanded grammar', this.grammar);

    this.parser = peggy.generate(this.grammar);

    this.syntaxErrorMsg = document.createElement('div');
    this.syntaxErrorMsg.classList.add('syntax-error');
    this.syntaxErrorMsg.style.color = "red";
    this.syntaxErrorMsg.style.fontSize = "10px";
    this.syntaxErrorMsg.style.position = "absolute";

    if (!opts.showSyntaxErrorMsg) {
        this.syntaxErrorMsg.style.display = "none";
    }
    insertAfter(this.input, this.syntaxErrorMsg);

    let completionsAreaSize = _.defaultTo(opts.completionsAreaSize, 10);
    let completionsAreaWidth = _.defaultTo(opts.completionsAreaWidth, 400);

    this.completionsArea = document.createElement('select');
    this.completionsArea.size = completionsAreaSize;
    this.completionsArea.style.width = `${completionsAreaWidth}px`;
    this.completionsArea.style.position = "absolute";
    this.completionsArea.style.display = "block";
    this.completionsArea.style.left = this.input.getBoundingClientRect().left;
    this.syntaxErrorMsg.style.left = this.input.getBoundingClientRect().left;
    this.completionsArea.style.display = "none";
    insertAfter(this.syntaxErrorMsg, this.completionsArea);
    this.completionsArea.addEventListener('change', (ev) => {
        this.selectCompletion(this.completionsArea.value);
    });
    this.completionsArea.addEventListener('blur', () => {
        this.completionsArea.style.display = "none";
    });

    this.input.addEventListener('focus', this.updateCompletions.bind(this));
    this.input.addEventListener('blur', () => {
        // Don't close the completions area immediatly. We need
        // to give it some time in order to be able to process a possible click event
        // on one of the completion candidates.
        setTimeout(() => {
            if (document.activeElement !== this.completionsArea) {
                this.completionsArea.style.display = "none";
            }
        }, 200);
    });
    this.input.addEventListener('keyup', this.keyUpHandler.bind(this));
    this.input.addEventListener('keydown', this.keyDownHandler.bind(this));
};

// Exports
window.PeggyInput = function(inputElOrSel, opts) {
    return new PeggyInput(inputElOrSel, opts);
}
