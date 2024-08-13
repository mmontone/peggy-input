$ = require('jquery');
_ = require('lodash');
peggy = require('peggy');

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

function StxInput(input, opts) {
    this.partialInput = null;
    this.value = null;
    this.init(input, opts);
}


StxInput.prototype.complete = function (input) {
    try {
        this.syntaxErrorMsg.html('');
        this.value = this.parser.parse(input);
        if (this.resultHandler) {
            this.resultHandler(this.value);
        }
    }
    catch(syntaxError) {
        console.log({syntaxError});
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

        console.log('Completions', completions);

        // If completions match a completer, expand the completion list using the completer
        /*if (completions.length == 1) {
            let more = this.completers[completions[0]];
            if (more) {
                completions = more;
            }
            }*/

        var expandedCompletions = [];
        completions.forEach(function (completion) {
            let expanded = this.completers[completion];
            if (expanded) {
                expandedCompletions = expandedCompletions.concat(expanded);
            } else {
                expandedCompletions = expandedCompletions.concat([completion]);
            }
        }.bind(this));

        completions = expandedCompletions;

        console.log('Expanded Completions', completions);

        // Filter the possible options based on what was found unparsed
        // in the syntax error:
        if (syntaxError.found) {
            completions = completions.filter(function (completion) {
                return _.startsWith(completion, syntaxError.found);
            }.bind(this));
        }

        console.log('Partial input', this.partialInput);

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

StxInput.prototype.fillCompletions = function (completions) {
    var html = '';
    completions.forEach(function (completion) {
        html += `<option value="${completion}">${completion}</option>`;
    });
    this.completionsArea.html(html);
};

StxInput.prototype.updateCompletions = function () {
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

StxInput.prototype.setPartialInput = function (pinput) {
    // For setting the partial input, check that the input matches
    // input value at cursor position (what the user is entering).
    let inputStr = this.input.val().substring(0, this.input.getCursorPosition());
    let userStr = inputStr.substring(inputStr.length - pinput.length, inputStr.length);
    if (pinput == userStr) {
        console.log('Setting partial input:', pinput);
        this.partialInput = pinput;
    }
};

StxInput.prototype.insertCompletion = function (completion) {
    let cursorPosition = this.input.getCursorPosition();
    this.input.val(insertString(this.input.val(), completion, cursorPosition));
    this.input.setCursorPosition(cursorPosition + completion.length);
};

StxInput.prototype.keyUpHandler = function (ev) {
    //console.log(ev.key);
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

StxInput.prototype.keyDownHandler = function (ev) {
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

StxInput.prototype.init = function (inputEl, opts) {
    if (typeof opts.grammar === 'string') {
        this.grammar = opts.grammar;
    }
    else {
        let name = genName('stxInput');
        window[name] = this;
        this.grammar = opts.grammar(name);
    }

    this.completers = opts.completers;
    this.resultHandler = opts.resultHandler;
    this.parser = peggy.generate(this.grammar);

    this.input = inputEl;
    this.syntaxErrorMsg = $('<div class="syntax-error" style="color: red; font-size: 10px;"></div>');
    this.syntaxErrorMsg.insertAfter(inputEl);
    this.completionsArea = $('<select size=10 style="width: 400px;position:fixed;display:none;">');
    this.completionsArea.insertAfter(this.syntaxErrorMsg);

    this.input.on('focus', this.updateCompletions.bind(this));
    this.input.on('blur', function () {
        this.completionsArea.hide();
    }.bind(this));
    this.input.keyup(this.keyUpHandler.bind(this));
    this.input.keydown(this.keyDownHandler.bind(this));
};

// Exports
window.StxInput = function(inputEl, opts) {
    return new StxInput(inputEl, opts);
}

// JQuery wrapper

$.fn.stxInput = function (opts) {
    var inst = this.get(0);
    return new StxInput($(inst), opts);
};
