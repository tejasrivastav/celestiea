#!/usr/bin/env bash
# Runs the migrator image as a one-off Fargate task and fails if the task fails.
#   ENV=dev scripts/run-migrator-task.sh migrate
#   ENV=dev scripts/run-migrator-task.sh import-seed --bucket <seed bucket>
set -euo pipefail

tf_output() { terraform -chdir="infra/terraform/envs/${ENV:?set ENV to dev or prod}" output -json "$1"; }

cluster=$(tf_output ecs_cluster | jq -r .)
task_definition=$(tf_output migrator_task_definition | jq -r .)
launch=$(tf_output migrator_launch)
# Arguments go through stdin, so flags like --bucket are never read as jq options.
command=$(printf '%s\n' "$@" | jq -R . | jq -sc '["dist/main.mjs"] + .')

network_args=()
# Fargate tasks get their own network interface; on the dev EC2 host they share its network.
if [ "$(jq -r .network_mode <<<"$launch")" = "awsvpc" ]; then
  network_args=(--network-configuration "$(jq -c '{awsvpcConfiguration: {subnets: .subnets, securityGroups: .security_groups, assignPublicIp: "DISABLED"}}' <<<"$launch")")
fi

task_arn=$(aws ecs run-task \
  --cluster "$cluster" \
  --task-definition "$task_definition" \
  --launch-type "$(jq -r .launch_type <<<"$launch")" \
  ${network_args[@]+"${network_args[@]}"} \
  --overrides "{\"containerOverrides\":[{\"name\":\"migrator\",\"command\":$command}]}" \
  --query 'tasks[0].taskArn' --output text)

echo "Started $task_arn; waiting for it to finish"
aws ecs wait tasks-stopped --cluster "$cluster" --tasks "$task_arn"

exit_code=$(aws ecs describe-tasks --cluster "$cluster" --tasks "$task_arn" \
  --query 'tasks[0].containers[0].exitCode' --output text)
echo "Migrator exited with $exit_code (logs: /ecs/celestiea-$ENV/migrator)"
[ "$exit_code" = "0" ]
