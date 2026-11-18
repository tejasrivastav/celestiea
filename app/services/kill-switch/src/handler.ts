import { ApiGatewayV2Client, UpdateStageCommand } from '@aws-sdk/client-apigatewayv2';
import {
  ApplicationAutoScalingClient,
  RegisterScalableTargetCommand,
} from '@aws-sdk/client-application-auto-scaling';
import { ECSClient, UpdateServiceCommand } from '@aws-sdk/client-ecs';
import { LambdaClient, PutFunctionConcurrencyCommand } from '@aws-sdk/client-lambda';
import { RDSClient, StopDBClusterCommand } from '@aws-sdk/client-rds';
import { pino } from 'pino';

const logger = pino();

// Invoked when the monthly budget is exceeded (via SNS) and when Aurora starts itself after
// seven days stopped (via EventBridge). It stops spend without deleting anything, so
// `make resume-dev` (terraform apply plus starting the cluster) brings everything back.
// ElastiCache Serverless cannot be paused; its minimum charge keeps running.
export async function handler(): Promise<void> {
  const env = readEnv();
  const steps: [string, () => Promise<unknown>][] = [
    [
      'block API traffic',
      () =>
        new ApiGatewayV2Client({}).send(
          new UpdateStageCommand({
            ApiId: env.HTTP_API_ID,
            StageName: '$default',
            DefaultRouteSettings: { ThrottlingBurstLimit: 0, ThrottlingRateLimit: 0 },
          }),
        ),
    ],
    [
      'stop write Lambda',
      () =>
        new LambdaClient({}).send(
          new PutFunctionConcurrencyCommand({
            FunctionName: env.WRITE_FUNCTION_NAME,
            ReservedConcurrentExecutions: 0,
          }),
        ),
    ],
    [
      'pin read service autoscaling to zero',
      () =>
        new ApplicationAutoScalingClient({}).send(
          new RegisterScalableTargetCommand({
            ServiceNamespace: 'ecs',
            ScalableDimension: 'ecs:service:DesiredCount',
            ResourceId: `service/${env.ECS_CLUSTER}/${env.ECS_SERVICE}`,
            MinCapacity: 0,
            MaxCapacity: 0,
          }),
        ),
    ],
    [
      'scale read service to zero',
      () =>
        new ECSClient({}).send(
          new UpdateServiceCommand({
            cluster: env.ECS_CLUSTER,
            service: env.ECS_SERVICE,
            desiredCount: 0,
          }),
        ),
    ],
    [
      'stop Aurora cluster',
      () =>
        new RDSClient({}).send(
          new StopDBClusterCommand({ DBClusterIdentifier: env.DB_CLUSTER_ID }),
        ),
    ],
  ];

  // Each step runs even if an earlier one fails (for example, the cluster is already
  // stopped), so one error never leaves the rest of the spend running.
  let failures = 0;
  for (const [name, run] of steps) {
    try {
      await run();
      logger.info({ step: name }, 'kill switch step done');
    } catch (error) {
      failures += 1;
      logger.error({ step: name, err: error }, 'kill switch step failed');
    }
  }
  if (failures === steps.length) {
    throw new Error('Every kill switch step failed');
  }
}

function readEnv() {
  const names = [
    'HTTP_API_ID',
    'WRITE_FUNCTION_NAME',
    'ECS_CLUSTER',
    'ECS_SERVICE',
    'DB_CLUSTER_ID',
  ] as const;
  const env = {} as Record<(typeof names)[number], string>;
  for (const name of names) {
    const value = process.env[name];
    if (!value) {
      throw new Error(`${name} is required`);
    }
    env[name] = value;
  }
  return env;
}
