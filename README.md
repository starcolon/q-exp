# Q-EXP

[Reinforcement Learning](http://www.cs.indiana.edu/~gasser/Salsa/rl.html) 
library for Node.js app. This implements Q-learning 
technique for exploration-exploitation mechanic.

## Installation

```bash
$ npm install q-exp
```

## Usage

To include `q-exp` library to your **Node.js** app:

```javascript
var qexp = require('q-exp');
```

Read the instructions all the way down to learn how to use.

## Implementation

This library is purely written in [ECMAScript 6](https://github.com/lukehoban/es6features) and runs 
with [Node.js](https://nodejs.org/en/). The implementation paradigm 
of the project tends towards functional programming in order to 
keep operations as simple and highly separable as possible. 

### Entire pipeline inspired by Promise

Promise plays a great role in pipelining all sequential 
and also parallel processings in this library. Every single 
canonical operation of Q-EXP takes its arguments and returns 
the Promise. This makes life easier for pipelining the sequential 
processes or operations for readability and manageability and, 
foremostly, side-effect-free paradigm.

## Sample pipeline of operations

To create an agent, load its learned policy from a physical file, 
then let it choose an action which it *believes* it would 
maximise the reward it would get, you may do this:

```javascript
// Initialisation
var agent = ql
	.newAgent('johndoe',actionSet=['walk','run','sleep'],alpha=0.35)
	.then(ql.bindRewardMeasure( /* reward function here */ ))
	.then(ql.bindActionCostMeasure( /* action cost function here */ ))
	.then(ql.bindStateGenerator( /* state generator here */ ))
	.then(ql.load('./dir')); 

// Start!
agent.then(ql.setState(initialState)) // Let the agent know the state
	.then(ql.step) // Ask the agent to move
	.then(ql.getState) // Now let's see how the agent moved
	.then((state) => /* Do something with the state */)

```

## Sample

A quick sample implementation is a classic [tic-tac-toe game](https://en.wikipedia.org/wiki/Tic-tac-toe), source code available at 
[/sample/tictactoe.js](https://github.com/starcolon/q-exp/blob/master/sample/tictactoe.js). 

#### To play with the trained bot:

```
	$ cd sample
	$ node tictactoe.js play
```

By Q-learning definition, the bot doesn't know the rule of 
the game. Yet, it knows which moves may probably lead to victory 
and which moves may likely introduce defeat. The bot may sometimes 
fail to end the game by an ultimate move because it doesn't know 
the rule. And such ultimate pattern may not be learned by itself.


#### To train the bot

```bash
	$ cd sample
	$ ./train-tictactoe
```


## Licence

This project is released under [Apache 2.0](http://www.apache.org/licenses/LICENSE-2.0) licence.