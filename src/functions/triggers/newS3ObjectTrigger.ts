import type { S3Event } from "aws-lambda";
import { env } from "../../config/env";
import { SendMessageBatchCommand } from "@aws-sdk/client-sqs";
import { randomUUID } from "node:crypto";
import { sqsClient } from "../../clients/sqsClient";

export async function handler(event: S3Event) {
	const BATCH_LIMIT_SQS = 10;
	let batchChunks = [];

	for (const record of event.Records) {
		const { bucket, object } = record.s3;

		const s3RecordPayload = {
			Id: randomUUID(),
			MessageBody: JSON.stringify({
				bucket: bucket.name,
				key: object.key,
			}),
		};

		if (batchChunks.length < BATCH_LIMIT_SQS) {
			batchChunks.push(s3RecordPayload);
			continue;
		}

		const batchSendMessageCommand = new SendMessageBatchCommand({
			QueueUrl: env.IMAGE_PROCESSING_QUEUE_URL,
			Entries: batchChunks,
		});

		await sqsClient.send(batchSendMessageCommand);

		batchChunks = [];
		batchChunks.push(s3RecordPayload);
	}

	if (batchChunks.length) {
		// when there are records to process but less than 10
		const batchSendMessageCommand = new SendMessageBatchCommand({
			QueueUrl: env.IMAGE_PROCESSING_QUEUE_URL,
			Entries: batchChunks,
		});

		await sqsClient.send(batchSendMessageCommand);
	}
}
