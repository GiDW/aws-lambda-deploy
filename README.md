# aws-lambda-deploy
## Usage

```bash
gald [command] [option]
```

There are 3 commands available
```bash
gald init
gald test
gald deploy
```
### Commands

#### init

Create (missing) configuration 
files that provide information 
to the module about 
the AWS Lambda function. 

After running `init` you should consider 
adding `lambda-secrets.json` 
to your `.gitignore`.

The `Handler` property consists of 
the module name and the function name. 

For example a file `handler.js` with:
```javascript
exports.myHandler = function () {};
```
The resulting `Handler` property looks like this:
```
"Handler": "handler.myHandler"
```

#### test

Execute all defined tests in `lambda-test.json` 
or a different JSON file.

```bash
gald test [optional json file]
```

#### deploy

Deploys the Lambda function to AWS Lambda.
In case the Lambda function does not exist 
or the configuration has been changed, 
the user will be notified.

Deploy looks for the archive defined in 
`lambda-config.json` under the property `archiveName`.
Your build system will have to provide a zip file 
with the necessary components 
for the AWS Lambda function.

For example, have a build script that looks like this:
```bash
zip -r -9 archive.zip handler.js
```
If your AWS Lambda function depends on other packages, 
make sure to include the `node_modules` folder, 
with the dependencies installed, 
in your zip file.
