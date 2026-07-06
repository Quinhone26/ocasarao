import { defineMcp } from "@lovable.dev/mcp-js";
import createDelivery from "./tools/create-delivery";
import deleteDelivery from "./tools/delete-delivery";
import getDelivery from "./tools/get-delivery";
import listDeliveries from "./tools/list-deliveries";
import updateDeliveryStatus from "./tools/update-delivery-status";

export default defineMcp({
  name: "ocasarao-mcp",
  title: "O Casarão — Entregas",
  version: "0.1.0",
  instructions:
    "Ferramentas para gerenciar entregas do motoboy: listar, buscar, criar, atualizar status e excluir entregas cadastradas em Umuarama-PR.",
  tools: [listDeliveries, getDelivery, createDelivery, updateDeliveryStatus, deleteDelivery],
});
