const $ = require('jquery');
const _ = require('lodash');
const peggy = require('peggy');
const loglevel = require('loglevel');

// Extension for getting cursor position in input field
$.fn.getCursorPosition = function() {
    var input = this.get(0);
    if (!input) return; // No (input) element found
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
};

$.fn.setCursorPosition = function (pos) {
    var input = this.get(0);
    input.selectionStart = pos;
    input.selectionEnd = pos;
};

/* Insert string at position */
function insertString(str, insertStr, position) {
    return str.substring(0, position) + insertStr + str.substring(position);
}

/* Generate a fresh name */
let nameId = 0;
function genName(name) {
    return name + nameId++;
}

function PeggyInput(input, opts) {
    this.logger = loglevel.getLogger('peggy-input');
    this.partialInput = null;
    this.value = null;
    this.init(input, opts);
}

PeggyInput.prototype.complete = function (input) {
    try {
        this.syntaxErrorMsg.html('');
        this.value = this.parser.parse(input, {peggyInput: this});
        if (this.resultHandler) {
            this.resultHandler(this.value);
        }
    }
    catch(syntaxError) {
        this.logger.debug({syntaxError});
        var completions = [];
        let expected = _.uniqWith(syntaxError.expected, _.isEqual);
        this.syntaxErrorMsg.html(syntaxError.message);
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

        this.logger.debug('Completions', completions);

        var expandedCompletions = [];
        completions.forEach(function (completion) {
            let completer = this.completers[completion];
            if (completer) {
                expandedCompletions = expandedCompletions.concat(completer.candidates);
            } else {
                expandedCompletions = expandedCompletions.concat([completion]);
            }
        }.bind(this));

        completions = expandedCompletions;

        this.logger.debug('Expanded Completions', completions);

        // Filter the possible options based on what was found unparsed
        // in the syntax error:
        if (syntaxError.found) {
            completions = completions.filter(function (completion) {
                return _.startsWith(completion, syntaxError.found);
            }.bind(this));
        }

        this.logger.debug('Partial input', this.partialInput);

        if (this.partialInput) {
            completions = completions.filter(function (completion) {
                return _.startsWith(completion, this.partialInput);
            }.bind(this));
        }

        this.partialInput = null;

        return {error: syntaxError.expected, completions: completions};
    }
    return {error:null, completions: []};
};

PeggyInput.prototype.fillCompletions = function (completions) {
    var html = '';
    completions.forEach(function (completion) {
        html += `<option value="${completion}">${completion}</option>`;
    });
    this.completionsArea.html(html);
};

PeggyInput.prototype.updateCompletions = function () {
    this.logger.debug('Updating completions');
    this.completionsArea.html('');
    var inputText = this.input.val();
    var completions = this.complete(inputText).completions;
    if (completions.length > 0) {
        this.fillCompletions(completions);
        this.completionsArea.show();
    } else {
        this.completionsArea.hide();
    }
};

PeggyInput.prototype.setPartialInput = function (pinput) {
    // For setting the partial input, check that the input matches
    // input value at cursor position (what the user is entering).
    let inputStr = this.input.val().substring(0, this.input.getCursorPosition());
    let userStr = inputStr.substring(inputStr.length - pinput.length, inputStr.length);
    if (pinput == userStr) {
        this.logger.debug('Setting partial input:', pinput);
        this.partialInput = pinput;
    }
};

PeggyInput.prototype.insertCompletion = function (completion) {
    let cursorPosition = this.input.getCursorPosition();
    this.input.val(insertString(this.input.val(), completion, cursorPosition));
    this.input.setCursorPosition(cursorPosition + completion.length);
};

PeggyInput.prototype.keyUpHandler = function (ev) {
    //this.logger.debug(ev.key);
    switch(ev.key) {
    case 'ArrowDown':
        break;
    case 'ArrowUp':
        break;
    case 'Enter':
        // When selecting the completion we need to take into account
        // what the user has already entered.
        // For example, if a 'everyone' completion was chosen,
        // and the user already entered 'every', then only append 'one' to the input value
        let inputVal = this.input.val().substring(0, this.input.getCursorPosition());
        let completionVal = this.completionsArea.val();

        // Try to match the completion repeatedly
        for (let i = Math.max(0, inputVal.length - completionVal.length); i < inputVal.length; i++) {
            let prefix = inputVal.substr(i, inputVal.length);
            if (_.startsWith(completionVal, prefix)) {
                // Found a prefix
                // Complete without the prefix
                this.insertCompletion(completionVal.substr(prefix.length, completionVal.length));
                this.updateCompletions();
                return;
            }
        }

        if (this.completionsArea.val() !== null) {
            this.insertCompletion(this.completionsArea.val());
            this.updateCompletions();
        }
        break;
    default: this.updateCompletions();
    }
};

PeggyInput.prototype.keyDownHandler = function (ev) {
    let selected = this.completionsArea.children('option:selected');
    switch(ev.key) {
    case 'ArrowDown':
        if (selected.length == 0) {
            this.completionsArea.children('option').first().attr('selected', 'selected');
        } else {
            selected.attr('selected', false);
            selected.next().attr('selected','selected');
        }
        // Prevent cursor from moving to the end
        ev.preventDefault();
        break;
    case 'ArrowUp':
        if (selected.length == 0) {
            this.completionsArea.children('option').first().attr('selected', 'selected');
        } else {
            selected.attr('selected', false);
            selected.prev().attr('selected','selected');
        }
        // Prevent cursor from moving to the beginning
        ev.preventDefault();
        break;
    }
};

PeggyInput.prototype._grammarCompleter = function (completerName, value) {
    this.logger.debug('Completing', completerName, value, _.includes(this.completers[completerName].candidates, value));
    this.setPartialInput(value);
    return _.includes(this.completers[completerName].candidates, value);
};

PeggyInput.prototype.expandCompletionRule = function (completerName) {
    return `${completerName} "${completerName}" = ${completerName}:(${this.completers[completerName].rule}) &{ return options.peggyInput._grammarCompleter("${completerName}", ${completerName}) } { return ${completerName} }`;
}

PeggyInput.prototype.init = function (inputSel, opts) {

    let inputEl = $(inputSel);
    this.logger.debug('Grammar', opts.grammar);
    this.grammar = opts.grammar;
    this.completers = opts.completers;
    this.resultHandler = opts.resultHandler;

    Object.keys(this.completers).forEach(function (completerName) {
        this.grammar += "\n";
        this.grammar += this.expandCompletionRule(completerName);
    }.bind(this));

    this.logger.debug('Expanded grammar', this.grammar);

    this.parser = peggy.generate(this.grammar);

    this.input = inputEl;
    this.syntaxErrorMsg = $('<div class="syntax-error" style="color: red; font-size: 10px;"></div>');
    this.syntaxErrorMsg.insertAfter(inputEl);
    this.completionsArea = $('<select size=10 style="width: 400px;position:absolute;display:none;">');
    this.completionsArea.insertAfter(this.syntaxErrorMsg);

    this.input.on('focus', this.updateCompletions.bind(this));
    this.input.on('blur', function () {
        this.completionsArea.hide();
    }.bind(this));
    this.input.keyup(this.keyUpHandler.bind(this));
    this.input.keydown(this.keyDownHandler.bind(this));
};

// Exports
window.PeggyInput = function(inputEl, opts) {
    return new PeggyInput(inputEl, opts);
}

// JQuery wrapper

$.fn.stxInput = function (opts) {
    var inst = this.get(0);
    return new PeggyInput($(inst), opts);
};
