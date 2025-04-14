import { SignUp, login, allUser,  getUser } from "../controllers/usercontroller";
import { Router } from "express";
import { authToken } from "../middlewares/auth";
import { ManagerandAdmin } from "../middlewares/rbac";
const router = Router()

router.post("/SignUp", SignUp)
router.post("/login", login)
router.get("/getuser/:id", authToken, getUser)
router.get("/alluser", authToken, ManagerandAdmin, allUser)
export default router