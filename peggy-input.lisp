(require :parenscript)
(require :cl-json)

(defpackage :peggy-input
  (:use :cl)
  (:export :format-grammar))

(in-package :peggy-input)

(defun format-grammar (rules)
  (with-output-to-string (s)
    (labels ((write-part (part)
               (cond
                 ((stringp part)
                  (format s "~s" part))
                 ((eq part :or)
                  (write-string "/" s))
                 ((and (listp part)
                       (eq (car part) :return))
                  (write-string "{ return " s)
                  (let ((ps:*parenscript-stream* s))
                    (ps:ps* (cadr part)))
                  (write-string "}" s))
                 ((and (listp part)
                       (keywordp (car part)))
                  (write-string (json:lisp-to-camel-case (string (car part))) s) ;; variable
                  (write-string ":" s)
                  (write-part (cadr part)))
                 (t
                  (write-string (json:lisp-to-camel-case (string part)) s)))))
      (dolist (rule rules)
        (destructuring-bind (rule-name &rest parts) rule
          (write-string (json:lisp-to-camel-case (string rule-name)) s)
          (write-string " = " s)
          (dolist (part parts)
            (write-part part)
            (write-string " " s))
          (terpri s))))))

(format-grammar
 '((start assignment)
   (assignment (:a assignee) ws (:op op) ws (:as assignment)
    (:return (ps:chain (ps:array a op) (concat as)))
    :or (:a assignee) (:return a))
   (assignee user :or group)
   (op "+" :or "-")
   (name (:word word) " " (:name name) (:return (+ word " " name)))))
