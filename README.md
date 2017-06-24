# Usage

There are 3 commands available
```
node-lambda init
node-lambda test
node-lambda deploy
```
### Commands

#### init

Create (missing) configuration 
files that provide information 
to the module about 
the AWS Lambda function. 

#### test

Executa all defined tests in `lambda-test.json` 
or a different JSON file.

```
node-lambda test [optional json file]
```

#### deploy

Deploys the Lambda function to AWS Lambda.
In case the Lambda funciton does not exist 
or the configuration has been changed, 
the user will be notified.
