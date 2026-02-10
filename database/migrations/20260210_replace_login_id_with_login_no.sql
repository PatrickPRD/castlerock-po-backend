-- Replace login_id with login_no on workers
ALTER TABLE workers
	CHANGE COLUMN login_id login_no VARCHAR(20) DEFAULT NULL;
