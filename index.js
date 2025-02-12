import express from "express";
import bodyParser from "body-parser";
import sqlite from "sqlite3";

const sqlite3 = sqlite.verbose();
const db = new sqlite3.Database("maga.db");

const app = express();
const port = 8000;

app.use(bodyParser.json());

app.post("/product/units", (req, res) => {
  const { unit, description } = req.body;
  if (!unit && !description) {
    return res
      .status(400)
      .json({ error: "Unidad y descripción no proporcionadas" });
  }

  try {
    const queryToCreate = `INSERT INTO units_of_measure (unit,description) VALUES (?,?)`;

    //validate if the unit already exist
    db.run(queryToCreate, [unit, description], function (err) {
      if (err) {
        if (err.message.includes("UNIQUE constraint failed")) {
          return res.status(400).json({
            error: "This unit already exist.",
            details: "This unit already exist.",
          });
        }
        return res.status(400).json({
          message: "Error insert unit of measure",
        });
      }
      res.status(201).json({
        message: `Unit of measure created successfully with id ${this.lastID}`,
        unit: unit,
        id: this.lastID,
      });
    });
  } catch (e) {
    console.error(e);
    res.status(400).json({
      error: "Error insert unit of measure",
      details: e.message,
    });
  }
});

app.post("/product/:barcode", async (req, res) => {
  const {
    barcode,
    name,
    brand,
    packaging_type,
    capacity,
    unit,
    categories,
    quantity_per_package,
  } = req.body;

  try {
    // Obtener unit_id
    const unitResult = await new Promise((resolve, reject) => {
      db.get(
        `SELECT id FROM units_of_measure WHERE unit = ?`,
        [unit],
        (err, row) => {
          if (err) return reject(err);
          resolve(row ? row.id : null);
        }
      );
    });

    if (!unitResult) {
      return res.status(400).json({ error: "Unit not found" });
    }

    // Iniciar transacción
    db.run("BEGIN TRANSACTION");

    // Insertar producto
    const productId = await new Promise((resolve, reject) => {
      db.run(
        `INSERT INTO products (barcode, name, brand, packaging_type, capacity, unit_id) VALUES (?, ?, ?, ?, ?, ?)`,
        [barcode, name, brand, packaging_type, capacity, unitResult],
        function (err) {
          if (err) return reject(err);
          resolve(this.lastID);
        }
      );
    });

    // Insertar variante del producto
    await new Promise((resolve, reject) => {
      db.run(
        `INSERT INTO product_variants (product_id, quantity_per_package) VALUES (?, ?)`,
        [productId, quantity_per_package],
        function (err) {
          if (err) return reject(err);
          resolve();
        }
      );
    });

    // Insertar categorías y relación producto-categoría
    for (let category of categories) {
      const categoryId = await new Promise((resolve, reject) => {
        db.run(
          `INSERT INTO categories (name) VALUES (?)`,
          [category],
          function (err) {
            if (err) return reject(err);
            resolve(this.lastID);
          }
        );
      });

      await new Promise((resolve, reject) => {
        db.run(
          `INSERT INTO product_categories (product_id, category_id) VALUES (?, ?)`,
          [productId, categoryId],
          function (err) {
            if (err) return reject(err);
            resolve();
          }
        );
      });
    }

    // Confirmar transacción
    db.run("COMMIT");

    return res.status(201).json({
      message: `Product created successfully with id ${productId}`,
      product: productId,
    });
  } catch (err) {
    // Deshacer transacción en caso de error
    db.run("ROLLBACK");

    return res.status(400).json({
      error: err.message || "Error inserting product",
    });
  }
});

app.listen(port, () => {
  console.log("Example app listening on port", port);
});
