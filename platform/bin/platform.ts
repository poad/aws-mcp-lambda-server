#!/usr/bin/env node
import { PlatformStack } from '../lib/platform-stack';
import * as cdk from 'aws-cdk-lib';

const app = new cdk.App();
const stack = new PlatformStack(app, 'AwsMcpLambdaServer', {

});
cdk.RemovalPolicies.of(stack).destroy();
