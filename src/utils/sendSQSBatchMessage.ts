import {
	SendMessageBatchCommand,
	type SendMessageBatchRequestEntry,
} from "@aws-sdk/client-sqs";

import { sqsClient } from "../clients/sqsClient";

interface Props {
	queueUrl: string;
	entries: SendMessageBatchRequestEntry[];
}

export function sendSQSBatchMessage({ entries, queueUrl }: Props) {
	const batchSendMessageCommand = new SendMessageBatchCommand({
		QueueUrl: queueUrl,
		Entries: entries,
	});

	return sqsClient.send(batchSendMessageCommand);
}
