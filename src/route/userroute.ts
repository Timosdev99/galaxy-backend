import { SignUp, login,logout, allUser,  getUser, validateToken } from "../controllers/usercontroller";
import { Router } from "express";
import { authToken } from "../middlewares/auth";
import { ManagerandAdmin } from "../middlewares/rbac";
const router = Router()

router.post("/SignUp", SignUp)
router.post("/login", login)
router.post("/logout", logout)
router.get("/getuser/:id", authToken, getUser)
router.get("/alluser", authToken, ManagerandAdmin, allUser)
router.get("/validate-token", authToken, validateToken)
export default router