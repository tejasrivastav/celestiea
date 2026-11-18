#!/usr/bin/env bash
# Runs the migrator image as a one-off Fargate task and fails if the task fails.
#   scripts/run-migrator-task.sh migrate
#   scripts/run-migrator-task.sh import-seed --bucket <seed bucket>
set -euo pipefail

tf_output() { terraform -chdir=infra/terraform/envs/dev output -json "$1"; }

cluster=$(tf_output ecs_cluster | jq -r .)
task_definition=$(tf_output migrator_task_definition | jq -r .)
network=$(tf_output migrator_network | jq -c '{awsvpcConfiguration: {subnets: .subnets, securityGroups: .security_groups, assignPublicIp: "DISABLED"}}')
command=$(jq -cn --args '["dist/main.mjs"] + $ARGS.positional' "$@")

task_arn=$(aws ecs run-task \
  --cluster "$cluster" \
  --task-definition "$task_definition" \
  --launch-type FARGATE \
  --network-configuration "$network" \
  --overrides "{\"containerOverrides\":[{\"name\":\"migrator\",\"command\":$command}]}" \
  --query 'tasks[0].taskArn' --output text)

echo "Started $task_arn; waiting for it to finish"
aws ecs wait tasks-stopped --cluster "$cluster" --tasks "$task_arn"

exit_code=$(aws ecs describe-tasks --cluster "$cluster" --tasks "$task_arn" \
  --query 'tasks[0].containers[0].exitCode' --output text)
echo "Migrator exited with $exit_code (logs: /ecs/celestiea-dev/migrator)"
[ "$exit_code" = "0" ]
