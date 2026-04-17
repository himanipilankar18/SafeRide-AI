import express from "express";
import {
  createEmergencyContact,
  deleteEmergencyContactById,
  getEmergencyContactsByDriverId,
} from "../db/sqlite.js";

const router = express.Router();

router.post("/emergency-contact", async (req, res) => {
  try {
    const { driverId, name, phone } = req.body || {};

    if (!driverId || !String(name || "").trim() || !String(phone || "").trim()) {
      return res.status(400).json({
        success: false,
        message: "driverId, name and phone are required",
      });
    }

    const contact = await createEmergencyContact({
      driverId: Number(driverId),
      name,
      phone,
    });

    res.status(201).json({
      success: true,
      contact,
    });
  } catch (error) {
    console.error("Error in POST /api/driver/emergency-contact:", error);
    res.status(500).json({
      success: false,
      message: error?.message || "Failed to save emergency contact",
    });
  }
});

router.get("/emergency-contact/:driverId", async (req, res) => {
  try {
    const driverId = Number(req.params.driverId);
    if (!driverId) {
      return res.status(400).json({
        success: false,
        message: "Valid driverId is required",
      });
    }

    const contacts = await getEmergencyContactsByDriverId(driverId);

    res.json({
      success: true,
      contacts,
    });
  } catch (error) {
    console.error("Error in GET /api/driver/emergency-contact/:driverId:", error);
    res.status(500).json({
      success: false,
      message: error?.message || "Failed to fetch emergency contacts",
    });
  }
});

router.delete("/emergency-contact/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Valid contact id is required",
      });
    }

    const result = await deleteEmergencyContactById(id);
    if (!result.deleted) {
      return res.status(404).json({
        success: false,
        message: "Emergency contact not found",
      });
    }

    res.json({
      success: true,
      deleted: true,
      contact: result.contact,
    });
  } catch (error) {
    console.error("Error in DELETE /api/driver/emergency-contact/:id:", error);
    res.status(500).json({
      success: false,
      message: error?.message || "Failed to delete emergency contact",
    });
  }
});

export default router;
