import type { PikkuWiringTypes } from "@pikku/core";
import { HttpWireDetailsForm } from "./wire-details/HttpWireDetailsForm";
import { QueueWireDetailsForm } from "./wire-details/QueueWireDetailsForm";
import { SchedulerWireDetailsForm } from "./wire-details/SchedulerWireDetailsForm";

interface WireDetailsFormProps {
  wireType: PikkuWiringTypes;
  wireId: string;
  metadata: any;
}

export const WireDetailsForm: React.FunctionComponent<WireDetailsFormProps> = ({
  wireType,
  wireId,
  metadata,
}) => {
  switch (wireType) {
    case 'http':
      return (
        <HttpWireDetailsForm
          wireType={wireType}
          wireId={wireId}
          metadata={metadata}
        />
      );
    case 'queue':
      return (
        <QueueWireDetailsForm
          wireType={wireType}
          wireId={wireId}
          metadata={metadata}
        />
      );
    case 'scheduler':
      return (
        <SchedulerWireDetailsForm
          wireType={wireType}
          wireId={wireId}
          metadata={metadata}
        />
      );
    case 'channel':
      return <div>Channel form coming soon</div>;
    case 'mcp':
      return <div>MCP form coming soon</div>;
    case 'cli':
      return <div>CLI form coming soon</div>;
    case 'workflow':
      return <div>Workflow form coming soon</div>;
    case 'rpc':
      return <div>RPC form coming soon</div>;
    default:
      return <div>Unknown wire type</div>;
  }
};
