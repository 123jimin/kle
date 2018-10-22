# KLE
KLE (KShootMania Lane Effector) is a program made by JiminP (@123jimin) to simplify adding lane zoom effects to KShootMania charts.

Currently this program is in "pre-alpha" stage, where everything is subject to change, subject to break, and made using duct tapes.

## Security Warning
Currently this program uses JavaScript's `eval` to evaluate expressions, and `; import` command can import any file in the system.
While there is a simple filter to only allow simple expressions before doing an `eval`, it might be possible to exploit this `eval` to execute arbitrary scripts.

Therefore, before executing a KLE script, examine it (and maybe `.ksh` too!) to make sure that no spooky thing is going on.

Once the project becomes active, usage of `eval` will be removed and arbitrary `; import` will be disabled (except for `stdlib` and scripts in same folder),
but for now, be careful on these possible security problems.

An exercise which may be impossible: craft a `.kle` script capable of arbitrary code executon when applied on a `.ksh` chart with a call to a command `;main 1`.

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
The KLE program can be executed like this: `node bin.js in.ksh script.kle out.ksh`.

When this is executed, `script.kle` will be applied on `in.ksh`, which will create `out.ksh`.
It is recommended not to include any notes (especially lasers) in `in.ksh`, since parsing `.ksh` files are not yet stable.

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
As you can see, every variables begin with a dollar sign. Also, you can specify default values for arguments like `$amount=50`.

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

`zoom_side`, `zoom_top`, and `zoom_bottom` are pre-defined commands which modify zoom values, so you can use it like `; zoom_side 50`
to increase the side zoom value by 50, or `; zoom_side 0 100` to make a sudden zoom change.
However, these three are very special since you can also use it in a more conventional way: `zoom_side = 0 100`.

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
(Under developement)

`;repeat N` ... `;end repeat` repeats given statements for a given time.
`;repeat A B` is identical to `;repeat B/A`, but emits an error if `B` is not divisible by `A`.
### while
(Under developement)

`;while (exp)` ... `;end while` repeats while `(exp)` evaluates to true.
## Standard library
Using `;import stdlib`, you can import the standard library to your script.
The standard library contains many useful effects.

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
