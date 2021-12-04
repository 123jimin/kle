# KLE
KLE (KSH Lane Effector) is a program made by JiminP (@123jimin) to simplify adding lane visual effects to `.ksh` charts.

## Security Warning
Currently this program uses JavaScript's `eval` to evaluate expressions, and `; import` command can import any file in the system.
While there is a simple filter to only allow simple expressions before doing an `eval`, it might be possible to exploit this `eval` to execute arbitrary scripts.

Therefore, before executing a KLE script, examine it (and maybe `.ksh` too!) to make sure that no spooky thing is going on.

Once the project becomes serious, usage of `eval` will be removed and arbitrary `; import` will be disabled (except for `stdlib` and scripts in same folder),
but for now, be careful on these possible security problems.

## How to use a script
A KLE script consists of various 'command's, which modifiy zoom values of a chart.
Commands have arguments, which can be used to modify their behavior

A command can be used in a `.ksh` chart like the example shown below.
In this example, `name-of-command` command will be execued, and three arguments `{1/4}`, `12`, `34` will be provided.
```
...
0000|00|--
--
;name-of-command {1/4} 12 34
0000|00|--
0000|00|--
...
```

The first argument of the command is *always* the length of the region which the command will be applied.
Lengths are represented in terms of amount of 192nd notes or in beats like `{3/8}` (three 8th notes in this case).

This is all you can do in a `.ksh` chart. You need to define commands in a `.kle` script file, then give them to the KLE program.
The KLE program can be executed like this: `node bin.js in.ksh out.ksh -k script.kle`.

When this is executed, `script.kle` will be applied on `in.ksh`, which will create `out.ksh`.
It is recommended not to include any notes (especially lasers) in `in.ksh`, since parsing `.ksh` files are not yet stable.

## Lua output
The ksh chart can be exported to a Lua script describing the chart, by specifying `-l` flag like this: `node bin.js in.ksh out.ksh -l chart.lua`.

## How to write a script
Every command definitions begin with a line `;command name-of-command $length $arg1 $arg2 ...`, and end with a line `;end command`.

The following code is an example of a command definition:
```
;command flick $length $amount=50
zoom_side = 0 $amount
@
zoom_side = $amount/2
@
zoom_side = $amount/4
@
zoom_side = $amount/8
@
zoom_side = 0
@
@
;end command
```
`@` (or you may use `0000|00|--`) is used to represent a chart line. Since there are six `@`s in the `flick` command, a `@` represent sixth of `$length`.
As you can see, every variable begin with a dollar sign. Also, you can specify default values for arguments like `$amount=50`.

You can include other commands in a command definition like this:
```
;command flick-left $length $amount
;flick $length -$amount
;end command
```

When using other commands, you can use expressions to compute values.
However, be careful not to include spaces in expressions. Spaces are used to separate arguments.

If you wish to include spaces because of readability, you can wrap arguments in parentheses.
```
;flick $length ($amount*2 + $length/10)
```

`zoom_side`, `zoom_top`, and `zoom_bottom` are pre-defined commands which modify relative zoom values, so you can use it like `; zoom_side 50`
to increase the side zoom value by 50, or `; zoom_side 0 100` to make a sudden zoom change.
However, these three are very special since you can also use it in a more conventional way: `zoom_side = 0 100`.

Here's an another example for a command where stdlib easeout and easein commands are used:
```
// You can use comments like this.
// Imports the standard library (explained below)
;import stdlib

;command bounce $length $amount
// Initial relative zoom values are zero.
zoom_bottom = 0
zoom_top = 0
// Gives an 'ease-out' effect...
// (Lanes zoom rapidly at first then moves slower)
;easeout_bottom $length/2 $amount
;easeout_top $length/2 $amount
@
// Zoom values achieve maximum values.
zoom_bottom = $amount
zoom_top = $amount
// Gives an 'ease-in' effect...
// (Opposite of ease-out)
;easein_bottom $length/2 -$amount
;easein_top $length/2 -$amount
@
// Final relative zoom values are zero again.
zoom_bottom = 0
zoom_top = 0
;end command
```

### How a command is executed
In KLE, calls to commands in a command is *not* processed immediately.
Instead, following steps happen when a command is being executed.
1. **Statements** in a command are processed.
2. While executing statements, calls to other **commands** are stored in a list.
3. After all statements are executed, **zoom values** are applied on a chart.
  - Timing is computed using \# of lines being encountered and the first argument `$length`.
4. After zoom values are applied, stored commands in the list are executed one by one.

Currently there is a significant constraint for every command: **every zoom values are relative, and they begin and end with 0**!
If a script does not satisfy this constraint, then sudden zoom changes will automatically be added.
Therefore, "global" changes are impossible with commands; you must specify them by manually editing zoom values in a `.ksh` chart.
However, even with this constraint, a lot of interesting effects can be achieved.

## Statements
Some statements are available for use. These can be used to make more complex commands.
### set
`;set` sets the value of a variable.
A value of a variable can either be a number or a label.

For example, the following code prints `42 hello`:
```
;set $foo 42
;set $bar hello
;print $foo $bar
```
### if-else
~~To make KLE Turing-complete,~~ KLE provides a branch statement.
```
;if $foo%4==0
  ;print Hello
;else if $foo%4==1
  ;print Bye
;else
  ;print Wow
;end if
```
### repeat
`;repeat N` ... `;end repeat` repeats given statements for a given time.
`;repeat A B` is identical to `;repeat B/A`, but emits an error if `B` is not divisible by `A`.

This is an implementation of FizzBuzz in KLE.
```
;set $i 1
;repeat 100
  ;if ($i % 15 == 0)
    ;print FizzBuzz
  ;else if ($i % 3 == 0)
    ;print Fizz
  ;else if ($i % 5 == 0)
    ;print Buzz
  ;else
    ;print $i
  ;end if
  ;set $i $i+1
;end repeat
```
### while
`;while (exp)` ... `;end while` repeats while `(exp)` evaluates to true.

### call
`;call $a $b` executes a command whose name is stored in `$a`.

This is *not* a pre-defined command but a *statement*.
If this were a command, then lines like `;call zoom_top 10` would be useless.
(Again, every zoom values in a command must begin and end with 0!)

### line
`;line` is identical to `@` or `0000|00|--`.
Actually latter two are aliases to the `;line` statement.

### process
`;process on` or `;process off` turns on/off processing KLE commands.
These are useful for quick developement of a chart.

This command only works when written in a `.ksh` chart file.

## Standard library
Using `;import stdlib`, you can import the standard library to your script.
The standard library contains many useful effects.

### ease-in, ease-out
```
;easein_bottom $length $amount
;easein_top $length $amount
;easein_side $length $amount

;easeout_bottom $length $amount
;easeout_top $length $amount
;easeout_side $length $amount
```
These commands can be used to convert a linear transition into ease-in or ease-out transition.

Example:
Following portion of a `.ksh` chart gives an ease-in effect for `zoom_top` from 40 to 100,
while ease-out effect will be given for `zoom_bottom` from 50 to 0.
```
--
t=4/4
zoom_top=40
zoom_bottom=50
;easein_top {4/4} 60
;easeout_bottom {4/4} -50
0000|00|--
zoom_top=100
zoom_bottom=0
--
```

## Pre-defined commands
Other than `zoom_*` commands, there are few other pre-defined commands.

### import
`;import a.kle` imports commands from `a.kle` KLE script.

`;import stdlib` always import the standard library.

### print
`;print foo` prints `foo` with a timestamp (\# of ticks from the beginning of the chart).

### error
`;error foo` prints `foo` then throws an error.

### null
`;null` does nothing. It's a boring command, so do not use it.
