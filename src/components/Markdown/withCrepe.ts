import { Crepe } from "@milkdown/crepe";
import { listener, listenerCtx } from "@milkdown/kit/plugin/listener";
import { MarkdownProps } from "./withMarkdown";

type CrepeSession = Promise<() => Promise<void>>;

/**
 * Orchestrates the creation of Crepe sessions to ensure
 * that no more than one editing session is active at a time.
 */
export class CrepeSessionOrchestrator {
  private isEditingSessionActive = false;
  // list of unprocessed crepe session requests
  private nextEditorSession?: () => CrepeSession;
  private crepeContentFillingSessionQueue: Array<() => Promise<void>> = [];

  private activeCrepeSession?: () => Promise<void>;

  /**
   * Spawns a function that creates an editing session
   * -- which is defined by
   * 1. instantiating the editor
   * 2. letting the editor update the DOM node
   * 3. Waiting for the editor to be destroyed
   */
  public async createEditorSession(sessionPayload: any) {
    // check if rootElementRef is healthy before proceeding
    if (!sessionPayload.rootElementRef) {
      return;
    }

    // Ends any current existing editing session
    if (this.isEditingSessionActive) {
      await this.activeCrepeSession?.();
      this.activeCrepeSession = undefined;
      this.isEditingSessionActive = false;
    }
    this.nextEditorSession = () => createCrepeSession(sessionPayload);
    this.parseSessionQueue();
  }

  /**
   * Spawns a function that creates a content filling session
   * -- which is defined by
   * 1. instantiating the editor
   * 2. filling the editor with content and letting it update the DOM node
   * 3. destroying the editor
   */
  public createContentFillingSession(sessionPayload: any) {
    // check if rootElementRef is healthy before proceeding
    if (!sessionPayload.rootElementRef) {
      return;
    }

    const spawnFillingSession = async () => {
      const session = await createCrepeSession(sessionPayload);
      return session();
    };
    this.crepeContentFillingSessionQueue.push(spawnFillingSession);
    this.parseSessionQueue();
  }

  /**
   * First goes through any editing requests (i.e. filling Stickies with info)
   * Then starts any editing session, which there can only be one of.
   */
  private async parseSessionQueue(): Promise<void> {
    // if there is an active session, then we should not create a new one
    // because this method will be called form multiple places, we want to make sure that we don't create multiple sessions
    if (this.activeCrepeSession) {
      return;
    }

    // if there is no active session, then we should create a new one
    if (this.crepeContentFillingSessionQueue.length > 0) {
      this.activeCrepeSession = this.crepeContentFillingSessionQueue.shift()!;

      await this.activeCrepeSession();
      this.activeCrepeSession = undefined;
      return this.parseSessionQueue();
    } else if (this.nextEditorSession) {
      // we set the active session, but we do NOT
      this.activeCrepeSession = await this.nextEditorSession();
      this.nextEditorSession = undefined;
      this.isEditingSessionActive = true;
    }
  }
}

let crepe: Crepe | undefined;
/**
 * Creates a crepe session
 * @returns method which destroys the crepe session
 */
const createCrepeSession = async (
  sessionPayload: MarkdownProps
): Promise<() => Promise<void>> => {
  if (crepe) {
    await crepe.destroy();
  }
  crepe = new Crepe({
    root: sessionPayload.rootElementRef,
    features: {},
    defaultValue: sessionPayload.previousMarkdown,
    featureConfigs: {
      [Crepe.Feature.Placeholder]: {
        text: "...",
      },
    },
  });

  crepe.editor.use(listener);
  crepe.editor.config((ctx) => {
    ctx
      .get(listenerCtx)
      .markdownUpdated((ctx, markdown) =>
        sessionPayload.onMarkdownUpdated(markdown)
      );
  });

  await crepe.create();
  return async () => {
    crepe = undefined;
  };
};
