import { toNextHandlers } from "poppyseed/next";
import { reference } from "../../../../lib/reference";

export const { GET, POST, DELETE } = toNextHandlers(reference.company);
