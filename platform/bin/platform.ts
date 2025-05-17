#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { PlatformStack } from '../lib/platform-stack';

const app = new cdk.App();
const stack = new PlatformStack(app, 'aws-mcp-lambda-server', {

});
cdk.RemovalPolicies.of(stack).destroy();
